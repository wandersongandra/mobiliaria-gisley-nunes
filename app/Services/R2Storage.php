<?php

namespace App\Services;

use Aws\S3\S3Client;
use Aws\Signature\S3SignatureV4;
use RuntimeException;

/**
 * O signer padrão do SDK deixa Content-Type e If-None-Match fora da assinatura
 * de URLs pré-assinadas. O upload do CRM envia ambos e o contrato depende de
 * If-None-Match para impedir replay/sobrescrita da chave aleatória.
 */
final class R2PresignSignatureV4 extends S3SignatureV4
{
    protected function getHeaderBlacklist()
    {
        $headers = parent::getHeaderBlacklist();
        unset($headers['content-type'], $headers['if-none-match']);

        return $headers;
    }

    protected function getPresignHeaderDenyList()
    {
        $headers = parent::getPresignHeaderDenyList();
        unset($headers['content-type']);

        return $headers;
    }
}

class R2Storage
{
    /**
     * Prefixo de todo objeto de imóvel no bucket. Pertence a esta classe porque
     * é ela quem valida caminhos e confere posse em belongsToProperty().
     */
    public const PREFIX = 'gisley/properties/';

    /**
     * Limita a alocação potencial do decoder ao conferir a área antes de a
     * imagem ser persistida como mídia pública. O limite lateral isolado não
     * protege contra arquivos com muitos pixels.
     */
    private const MAX_IMAGE_PIXELS = 40_000_000;

    private const IMAGE_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
    ];

    private function configured(): bool
    {
        $config = config('services.r2');

        return ! empty($config['account_id'])
            && ! empty($config['bucket'])
            && ! empty($config['access_key_id'])
            && ! empty($config['secret_access_key']);
    }

    private function client(): S3Client
    {
        if (! $this->configured()) {
            throw new RuntimeException('STORAGE_NOT_CONFIGURED');
        }

        $config = config('services.r2');

        return new S3Client([
            'version' => 'latest',
            'region' => 'auto',
            'endpoint' => 'https://'.$config['account_id'].'.r2.cloudflarestorage.com',
            'use_path_style_endpoint' => true,
            'credentials' => [
                'key' => $config['access_key_id'],
                'secret' => $config['secret_access_key'],
            ],
        ]);
    }

    public function safeFileName(string $value): string
    {
        $value = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value;
        $value = preg_replace('/[^a-zA-Z0-9._-]+/', '-', $value) ?: 'imagem';
        $value = preg_replace('/-+/', '-', $value) ?: $value;
        $value = trim($value, '-.');

        return substr($value !== '' ? $value : 'imagem', 0, 100);
    }

    public function assertKey(string $path): string
    {
        if ($path === '' || strlen($path) > 500 || str_starts_with($path, '/')) {
            throw new RuntimeException('INVALID_ASSET');
        }

        $key = $path;
        if (
            ! str_starts_with($key, self::PREFIX)
            || str_contains($key, '\\')
            || str_contains($key, '//')
            || preg_match('/[\x00-\x1F\x7F]/', $key) === 1
            || preg_match('#^[A-Za-z0-9._/-]+$#D', $key) !== 1
        ) {
            throw new RuntimeException('INVALID_ASSET');
        }

        foreach (explode('/', $key) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                throw new RuntimeException('INVALID_ASSET');
            }
        }

        return $key;
    }

    public function belongsToProperty(string $path, string $propertyId): bool
    {
        try {
            $key = $this->assertKey($path);
        } catch (RuntimeException) {
            return false;
        }

        return $propertyId !== ''
            && ! str_contains($propertyId, '/')
            && ! str_contains($propertyId, '\\')
            && str_starts_with($key, self::PREFIX.$propertyId.'/');
    }

    public function assetUrl(string $path): string
    {
        $key = $this->assertKey($path);

        return '/media/'.implode('/', array_map('rawurlencode', explode('/', $key)));
    }

    public function presignPut(string $path, string $contentType): string
    {
        $key = $this->assertKey($path);
        $contentType = strtolower(trim($contentType));
        if (! in_array($contentType, self::IMAGE_MIME_TYPES, true)) {
            throw new RuntimeException('INVALID_FILE');
        }

        $client = $this->client();

        $command = $client->getCommand('PutObject', [
            'Bucket' => config('services.r2.bucket'),
            'Key' => $key,
            'ContentType' => $contentType,
            'IfNoneMatch' => '*',
        ]);

        $handlerList = $command->getHandlerList();
        $handlerList->remove('signer');
        if (empty($command['ChecksumAlgorithm']) && empty($command['AddContentMD5'])) {
            $handlerList->remove('s3.checksum');
        }

        $request = \Aws\serialize($command);
        $signer = new R2PresignSignatureV4('s3', 'auto');
        $request = $signer->presign(
            $request,
            $client->getCredentials()->wait(),
            '+'.max(60, min(3600, (int) config('services.r2.upload_expires', 600))).' seconds'
        );

        return (string) $request->getUri();
    }

    public function listPropertyObjects(?string $continuationToken = null): array
    {
        $params = [
            'Bucket' => config('services.r2.bucket'),
            'Prefix' => self::PREFIX,
            'MaxKeys' => 1000,
        ];
        if ($continuationToken !== null) {
            $params['ContinuationToken'] = $continuationToken;
        }

        $result = $this->client()->listObjectsV2($params);
        $objects = [];
        foreach ($result['Contents'] ?? [] as $object) {
            $key = isset($object['Key']) ? $this->assertKey((string) $object['Key']) : '';
            $lastModified = $object['LastModified'] ?? null;
            if ($key !== '' && $lastModified instanceof \DateTimeInterface) {
                $objects[] = [
                    'key' => $key,
                    'last_modified' => $lastModified,
                ];
            }
        }

        $nextToken = null;
        if ((bool) ($result['IsTruncated'] ?? false)) {
            $nextToken = $result['NextContinuationToken'] ?? null;
            if (! is_string($nextToken) || $nextToken === '') {
                throw new RuntimeException('STORAGE_PAGINATION_INVALID');
            }
        }

        return ['objects' => $objects, 'next_token' => $nextToken];
    }

    /**
     * Gera uma URL pré-assinada para GET no R2. Quando $contentType é
     * fornecido, força ResponseContent-Type e Content-Disposition na resposta
     * do R2. O tipo é validado contra a mesma allowlist usada no upload.
     *
     * A URL do R2 está em domínio diferente (*.r2.cloudflarestorage.com),
     * portanto cookies de sessão da aplicação não são enviados — isolando
     * a origem do bucket da origem de administração.
     *
     * @param  string|null  $contentType  MIME type validado (ex: image/jpeg)
     * @param  string|null  $fileName  Nome seguro do arquivo para Content-Disposition
     */
    public function presignGet(string $path, int $seconds = 60, ?string $contentType = null, ?string $fileName = null): string
    {
        $key = $this->assertKey($path);
        $client = $this->client();

        if ($contentType !== null) {
            $contentType = strtolower(trim($contentType));
            if ($contentType !== '' && ! in_array($contentType, self::IMAGE_MIME_TYPES, true)) {
                throw new RuntimeException('INVALID_FILE');
            }
        }

        $params = [
            'Bucket' => config('services.r2.bucket'),
            'Key' => $key,
        ];

        // Força Content-Type estrito na resposta — o navegador nunca faz
        // sniffing quando o servidor declara o tipo com ResponseContent-Type.
        if ($contentType !== null && $contentType !== '') {
            $params['ResponseContent-Type'] = $contentType;
        }

        // Content-Disposition inline com filename — permite exibir as imagens
        // permitidas na página e fixa o nome do arquivo. SVG e tipos textuais
        // não fazem parte da allowlist e não são aceitos neste caminho.
        if ($fileName !== null && $fileName !== '') {
            $safeName = preg_replace('/[^A-Za-z0-9._-]/', '-', $fileName) ?: 'imagem';
            $params['ResponseContentDisposition'] = 'inline; filename="'.$safeName.'"';
        }

        $command = $client->getCommand('GetObject', $params);

        return (string) $client
            ->createPresignedRequest($command, '+'.max(30, min(600, $seconds)).' seconds')
            ->getUri();
    }

    public function metadata(string $path): array
    {
        $key = $this->assertKey($path);

        try {
            $result = $this->client()->headObject([
                'Bucket' => config('services.r2.bucket'),
                'Key' => $key,
            ]);
        } catch (\Throwable) {
            return ['exists' => false, 'size' => null, 'contentType' => null];
        }

        return [
            'exists' => true,
            'size' => isset($result['ContentLength']) ? (int) $result['ContentLength'] : null,
            'contentType' => isset($result['ContentType'])
                ? strtolower(trim(explode(';', (string) $result['ContentType'])[0]))
                : null,
        ];
    }

    public function delete(string $path): void
    {
        $key = $this->assertKey($path);

        $this->client()->deleteObject([
            'Bucket' => config('services.r2.bucket'),
            'Key' => $key,
        ]);
    }

    /**
     * Lê a imagem armazenada para validar o formato e as dimensões reais. Os
     * valores declarados pelo navegador nunca são persistidos sem esta prova.
     * O controller chama metadata() antes deste método e limita o objeto a 12 MB.
     *
     * @return array{width: int, height: int, mime: string}|null
     */
    public function imageInfo(string $path, string $contentType): ?array
    {
        $key = $this->assertKey($path);

        try {
            $result = $this->client()->getObject([
                'Bucket' => config('services.r2.bucket'),
                'Key' => $key,
            ]);
            $bytes = (string) $result['Body'];
        } catch (\Throwable) {
            return null;
        }

        return self::imageInfoFromBytes($bytes, $contentType);
    }

    /**
     * Assinaturas de magic bytes dos formatos de imagem aceitos. A validação
     * ocorre ANTES de qualquer função nativa de manipulação de imagem processar
     * o arquivo em memória, para que payloads maliciosos mascarados como imagem
     * nunca alcancem o decoder do PHP (mitigação PHP2Shell CVE-2026-109618).
     *
     * Cada formato mapeia para uma lista de prefixos binários aceitos. O
     * verificador testa cada prefixo com str_starts_with() e rejeita o arquivo
     * se nenhum corresponder.
     *
     * SVG (image/svg+xml) é explicitamente EXCLUÍDO. SVG permite execução de
     * JavaScript embutido (<script>, event handlers, foreignObject) no contexto
     * da origem se servido diretamente, configurando vetor de Stored XSS.
     * Mesmo com Content-Type correto, navegadores podem renderizar SVG inline
     * em tags <img>, e o payload é executado quando aberto diretamente.
     */
    private const MAGIC_BYTES = [
        'image/jpeg' => ["\xFF\xD8\xFF"],
        'image/png' => ["\x89\x50\x4E\x47\x0D\x0A\x1A\x0A"],
        'image/webp' => ['RIFF'],
        'image/avif' => [],
    ];

    /**
     * Sufixos adicionais (não no prefixo) para formatos que precisam de verificação
     * em offset > 0. O validador confere estes apenas se o prefixo já passou.
     */
    private const MAGIC_BYTES_OFFSET = [
        'image/webp' => [['offset' => 8, 'value' => 'WEBP']],
        'image/avif' => [['offset' => 4, 'value' => 'ftyp']],
    ];

    /**
     * Marcadores de brand aceitos para AVIF/HEIF (bytes 8-12).
     */
    private const AVIF_BRANDS = ['avif', 'avis', 'mif1'];

    /**
     * Valida magic bytes ANTES de chamar qualquer função nativa de imagem.
     * Retorna true se os primeiros bytes correspondem ao formato esperado.
     *
     * Rejeita explicitamente arquivos prefixed com UTF-8 BOM (\xEF\xBB\xBF),
     * que é um vetor de polyglot: um arquivo pode começar com BOM seguido de
     * magic bytes de imagem válidos, mascarando um payload de script. Nenhum
     * formato de imagem binário começa com BOM.
     */
    private static function validateMagicBytes(string $bytes, string $expectedMime): bool
    {
        $expectedMime = strtolower(trim($expectedMime));
        $prefixes = self::MAGIC_BYTES[$expectedMime] ?? null;
        if ($prefixes === null) {
            return false;
        }

        // Rejeita BOM UTF-8 — vetor de polyglot para mascarar scripts como imagem.
        if (strlen($bytes) >= 3 && str_starts_with($bytes, "\xEF\xBB\xBF")) {
            return false;
        }

        // AVIF não tem prefixo fixo — o box ftyp começa no offset 4.
        if ($expectedMime === 'image/avif') {
            if (strlen($bytes) < 12) {
                return false;
            }
            if (substr($bytes, 4, 4) !== 'ftyp') {
                return false;
            }
            $brand = strtolower(substr($bytes, 8, 4));

            return in_array($brand, self::AVIF_BRANDS, true);
        }

        $matched = false;
        foreach ($prefixes as $prefix) {
            if (str_starts_with($bytes, $prefix)) {
                $matched = true;
                break;
            }
        }
        if (! $matched) {
            return false;
        }

        // Verificações em offset para WebP.
        $offsets = self::MAGIC_BYTES_OFFSET[$expectedMime] ?? [];
        foreach ($offsets as $check) {
            $offset = $check['offset'];
            $value = $check['value'];
            if (strlen($bytes) < $offset + strlen($value)) {
                return false;
            }
            if (substr($bytes, $offset, strlen($value)) !== $value) {
                return false;
            }
        }

        return true;
    }

    /**
     * Verifica se há memória suficiente para processar o payload sem risco
     * de exaustão. A vulnerabilidade PHP2Shell (CVE-2026-109618) explora OOM
     * durante o processamento de uploads; esta verificação adicional garante
     * que não alocamos mais memória do que o disponível antes de processar.
     */
    private static function hasMemoryFor(int $bytesNeeded): bool
    {
        $limit = (string) ini_get('memory_limit');
        if ($limit === '' || $limit === '-1') {
            // Sem limite configurado — confia no teto de 12 MB do payload.
            return true;
        }

        $limitBytes = self::parseMemoryLimit($limit);
        if ($limitBytes === 0) {
            return true;
        }

        $used = memory_get_usage(true);

        return ($used + $bytesNeeded) < $limitBytes;
    }

    /**
     * Converte um valor de memory_limit (ex: "256M", "1G") para bytes.
     */
    private static function parseMemoryLimit(string $limit): int
    {
        $limit = trim($limit);
        if ($limit === '' || ctype_digit($limit)) {
            return (int) $limit;
        }

        $unit = strtolower(substr($limit, -1));
        $value = (int) $limit;

        return match ($unit) {
            'g' => $value * 1024 * 1024 * 1024,
            'm' => $value * 1024 * 1024,
            'k' => $value * 1024,
            default => $value,
        };
    }

    /**
     * @return array{width: int, height: int, mime: string}|null
     */
    public static function imageInfoFromBytes(string $bytes, string $contentType): ?array
    {
        $expectedMime = strtolower(trim($contentType));

        if ($bytes === '' || strlen($bytes) > 12 * 1024 * 1024) {
            return null;
        }

        if (! in_array($expectedMime, self::IMAGE_MIME_TYPES, true)) {
            return null;
        }

        // Camada 1: magic bytes ANTES de qualquer função nativa processar o arquivo.
        // Isto previne que payloads maliciosos mascarados como imagem alcancem o
        // decoder interno do PHP, que poderia ser vetor para RCE via OOM (PHP2Shell).
        if (! self::validateMagicBytes($bytes, $expectedMime)) {
            return null;
        }

        // Camada 2: checagem de memória disponível antes de processar.
        if (! self::hasMemoryFor(strlen($bytes) * 2)) {
            return null;
        }

        // Camada 3: getimagesizefromstring sem supressão de erros (@). Usamos
        // set_error_handler temporário para capturar warnings do decoder sem
        // mascarar erros reais de RCE/buffer overflow.
        $details = false;
        set_error_handler(static function (int $errno, string $errstr): bool {
            // Qualquer warning do decoder de imagem indica arquivo malformado.
            return true;
        }, E_WARNING | E_NOTICE);
        try {
            $result = getimagesizefromstring($bytes);
            $details = $result === false ? false : $result;
        } finally {
            restore_error_handler();
        }

        if ($details === false) {
            return null;
        }

        $actualMime = strtolower($details['mime']);
        $width = $details[0];
        $height = $details[1];

        // Camada 4: validação cruzada MIME + dimensões + contagem de pixels.
        if (! in_array($actualMime, self::IMAGE_MIME_TYPES, true)
            || ! hash_equals($expectedMime, $actualMime)
            || $width < 1 || $width > 20_000 || $height < 1 || $height > 20_000
            || ($width * $height) > self::MAX_IMAGE_PIXELS) {
            return null;
        }

        return ['width' => $width, 'height' => $height, 'mime' => $actualMime];
    }
}
