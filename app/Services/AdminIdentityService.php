<?php

namespace App\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminIdentityService
{
    /**
     * Cria uma conta para uma identidade inédita. Dois provedores com o mesmo
     * email não são unidos implicitamente: somente o subject imutável do mesmo
     * provider identifica uma conta já existente.
     *
     * @param  array{provider: string, providerSubject: string, email: string, name: string}  $identity
     * @return array{userId: string, identityId: string, openId: string, email: string, name: string}
     */
    public function resolve(array $identity): array
    {
        $provider = strtolower(trim($identity['provider']));
        $subject = trim($identity['providerSubject']);
        $email = strtolower(trim($identity['email']));
        $name = trim($identity['name']);

        return DB::transaction(function () use ($provider, $subject, $email, $name): array {
            $existing = DB::table('morada_oauth_identities')
                ->where('provider', $provider)
                ->where('provider_subject', $subject)
                ->lockForUpdate()
                ->first();

            if ($existing) {
                DB::table('morada_oauth_identities')->where('id', $existing->id)->update([
                    'provider_email' => $email,
                    'updated_at' => now(),
                ]);
                DB::table('morada_users')->where('id', $existing->user_id)->update([
                    'email' => $email,
                    'name' => $name,
                    'updated_at' => now(),
                ]);

                return [
                    'userId' => (string) $existing->user_id,
                    'identityId' => (string) $existing->id,
                    'openId' => $subject,
                    'email' => $email,
                    'name' => $name,
                ];
            }

            $userId = (string) Str::uuid();
            $identityId = (string) Str::uuid();
            DB::table('morada_users')->insert([
                'id' => $userId,
                'email' => $email,
                'name' => $name,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            try {
                DB::table('morada_oauth_identities')->insert([
                    'id' => $identityId,
                    'user_id' => $userId,
                    'provider' => $provider,
                    'provider_subject' => $subject,
                    'provider_email' => $email,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (QueryException $error) {
                // O índice composto vence uma corrida de primeiro login. A
                // transação externa será desfeita e o callback pode tentar de
                // novo com a identidade já persistida.
                throw $error;
            }

            if ($provider === 'manus') {
                DB::table('morada_admin_users')->updateOrInsert(
                    ['open_id' => $subject],
                    [
                        'user_id' => $userId,
                        'email' => $email,
                        'name' => $name,
                        'last_login_at' => now(),
                    ]
                );
            }

            return [
                'userId' => $userId,
                'identityId' => $identityId,
                'openId' => $subject,
                'email' => $email,
                'name' => $name,
            ];
        });
    }
}
