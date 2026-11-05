<?php

namespace Tests\Feature\Security;

use App\Services\R2Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Cobre mitigação de polyglots e Stored XSS no pipeline de upload de imagens.
 *
 * A validação em R2Storage::imageInfoFromBytes() possui 4 camadas sequenciais:
 *   1. Magic bytes estritos (binário, offset exato)
 *   2. Checagem de memória disponível
 *   3. getimagesizefromstring com error_handler (sem supressão @)
 *   4. MIME cross-check + dimensões + pixel count
 *
 * SVG é explicitamente banido por permitir JavaScript embutido (Stored XSS).
 */
class PolyglotUploadTest extends TestCase
{
    /**
     * Script PHP com prefixo JPEG válido — polyglot que passa no magic
     * bytes mas contém código executável após o header.
     */
    public function test_php_script_with_jpeg_magic_bytes_prefix_is_rejected(): void
    {
        // Magic bytes JPEG seguidos de payload PHP.
        $polyglot = "\xFF\xD8\xFF\xE0<?php system(\$_GET['cmd']); ?>";
        $result = R2Storage::imageInfoFromBytes($polyglot, 'image/jpeg');

        $this->assertNull($result, 'Polyglot PHP+JPEG deve ser rejeitado pela Camada 3 (getimagesizefromstring).');
    }

    /**
     * HTML com prefixo JPEG — polyglot que poderia ser renderizado como
     * página se o Content-Type fosse sniffado para text/html.
     */
    public function test_html_with_jpeg_magic_bytes_prefix_is_rejected(): void
    {
        $polyglot = "\xFF\xD8\xFF\xE0<!DOCTYPE html><script>alert('xss')</script>";
        $result = R2Storage::imageInfoFromBytes($polyglot, 'image/jpeg');

        $this->assertNull($result, 'Polyglot HTML+JPEG deve ser rejeitado.');
    }

    /**
     * Script PHP com prefixo PNG válido.
     */
    public function test_php_script_with_png_magic_bytes_prefix_is_rejected(): void
    {
        $pngHeader = "\x89\x50\x4E\x47\x0D\x0A\x1A\x0A";
        $polyglot = $pngHeader."<?php echo file_get_contents('/etc/passwd'); ?>";
        $result = R2Storage::imageInfoFromBytes($polyglot, 'image/png');

        $this->assertNull($result, 'Polyglot PHP+PNG deve ser rejeitado pela Camada 3.');
    }

    /**
     * SVG com inline JavaScript — deve ser rejeitado pois image/svg+xml
     * não está em IMAGE_MIME_TYPES.
     */
    public function test_svg_with_inline_javascript_is_rejected(): void
    {
        $svg = '<?xml version="1.0"?>'
            .'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)">'
            .'<script>alert("xss")</script>'
            .'</svg>';

        // SVG com content-type declarado como SVG — MIME não está na whitelist.
        $result = R2Storage::imageInfoFromBytes($svg, 'image/svg+xml');
        $this->assertNull($result, 'SVG deve ser rejeitado: image/svg+xml não está em IMAGE_MIME_TYPES.');

        // Tentativa de mascarar SVG como image/png — magic bytes não correspondem.
        $result = R2Storage::imageInfoFromBytes($svg, 'image/png');
        $this->assertNull($result, 'SVG mascarado como PNG deve ser rejeitado na Camada 1 (magic bytes).');

        // Tentativa de mascarar SVG como image/jpeg.
        $result = R2Storage::imageInfoFromBytes($svg, 'image/jpeg');
        $this->assertNull($result, 'SVG mascarado como JPEG deve ser rejeitado na Camada 1 (magic bytes).');
    }

    /**
     * Arquivo prefixed com UTF-8 BOM (\xEF\xBB\xBF) seguido de magic bytes
     * JPEG — vetor de polyglot para mascarar scripts como imagem.
     */
    public function test_bom_prefixed_jpeg_is_rejected(): void
    {
        $bom = "\xEF\xBB\xBF";
        $jpegMagic = "\xFF\xD8\xFF\xE0";
        $polyglot = $bom.$jpegMagic.str_pad('', 100, "\x00");

        $result = R2Storage::imageInfoFromBytes($polyglot, 'image/jpeg');
        $this->assertNull($result, 'BOM-prefixed JPEG deve ser rejeitado (vetor de polyglot).');
    }

    /**
     * BOM-prefixed PNG — mesmo vetor, formato diferente.
     */
    public function test_bom_prefixed_png_is_rejected(): void
    {
        $bom = "\xEF\xBB\xBF";
        $pngMagic = "\x89\x50\x4E\x47\x0D\x0A\x1A\x0A";
        $polyglot = $bom.$pngMagic.str_pad('', 100, "\x00");

        $result = R2Storage::imageInfoFromBytes($polyglot, 'image/png');
        $this->assertNull($result, 'BOM-prefixed PNG deve ser rejeitado (vetor de polyglot).');
    }

    /**
     * Imagem JPEG válida NÃO é rejeitada — garante que a validação
     * não tem falsos positivos que quebrariam uploads legítimos.
     */
    public function test_valid_jpeg_is_accepted(): void
    {
        // Mínimo JPEG válido: SOI + APP0 + EOI com dimensões mínimas.
        $jpeg = $this->minimalJpeg(1, 1);
        $result = R2Storage::imageInfoFromBytes($jpeg, 'image/jpeg');

        $this->assertNotNull($result, 'JPEG válido deve ser aceito.');
        $this->assertSame('image/jpeg', $result['mime']);
    }

    /**
     * Imagem PNG válida NÃO é rejeitada.
     */
    public function test_valid_png_is_accepted(): void
    {
        $png = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1NwAAAABJRU5ErkJggg==',
            true,
        );
        $this->assertNotFalse($png);

        $result = R2Storage::imageInfoFromBytes($png, 'image/png');
        $this->assertNotNull($result, 'PNG válido deve ser aceito.');
        $this->assertSame('image/png', $result['mime']);
        $this->assertSame(1, $result['width']);
        $this->assertSame(1, $result['height']);
    }

    /**
     * Dados binários aleatórios que não correspondem a nenhum magic bytes.
     */
    #[DataProvider('nonImagePayloads')]
    public function test_non_image_payloads_are_rejected(string $payload, string $declaredMime): void
    {
        $result = R2Storage::imageInfoFromBytes($payload, $declaredMime);
        $this->assertNull($result, 'Payload não-imagem deve ser rejeitado.');
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function nonImagePayloads(): array
    {
        return [
            'empty' => ['', 'image/jpeg'],
            'text' => ['Hello World', 'image/jpeg'],
            'php' => ['<?php phpinfo(); ?>', 'image/png'],
            'html' => ['<html><body>XSS</body></html>', 'image/webp'],
            'js' => ['alert(document.cookie)', 'image/avif'],
            'garbage' => [str_repeat("\x00", 100), 'image/jpeg'],
        ];
    }

    /**
     * Gera um JPEG mínimo válido com dimensões especificadas.
     */
    private function minimalJpeg(int $width, int $height): string
    {
        // SOI (Start of Image)
        $jpeg = "\xFF\xD8\xFF\xE0";
        // JFIF APP0 marker
        $jpeg .= "\x00\x10"; // Length = 16
        $jpeg .= "JFIF\x00"; // Identifier
        $jpeg .= "\x01\x01"; // Version 1.1
        $jpeg .= "\x00"; // Units: no units
        $jpeg .= "\x00\x01\x00\x01"; // X density, Y density
        $jpeg .= "\x00\x00"; // No thumbnail
        // SOF0 (Start of Frame)
        $jpeg .= "\xFF\xC0";
        $jpeg .= "\x00\x0B"; // Length
        $jpeg .= "\x08"; // Precision: 8 bits
        $jpeg .= pack('n', $height).pack('n', $width); // Dimensions
        $jpeg .= "\x01"; // 1 component
        $jpeg .= "\x01\x11\x00"; // Component: Y, 1x1, quant table 0
        // DHT (Huffman table - minimal)
        $jpeg .= "\xFF\xC4\x00\x1F\x00";
        $jpeg .= str_repeat("\x00", 16);
        $jpeg .= "\x00";
        // SOS (Start of Scan)
        $jpeg .= "\xFF\xDA\x00\x08\x01\x01\x00\x00\x3F\x00";
        // Scan data (empty/padding)
        $jpeg .= "\x00";
        // EOI (End of Image)
        $jpeg .= "\xFF\xD9";

        return $jpeg;
    }
}
