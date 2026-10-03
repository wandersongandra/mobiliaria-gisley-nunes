<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

trait CreatesAdminIdentity
{
    /** @return array{user_id: string, identity_id: string} */
    protected function attachAdminIdentity(string $openId, string $email, string $name): array
    {
        $userId = (string) Str::uuid();
        $identityId = (string) Str::uuid();

        DB::table('morada_users')->insert([
            'id' => $userId,
            'email' => strtolower($email),
            'name' => $name,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('morada_oauth_identities')->insert([
            'id' => $identityId,
            'user_id' => $userId,
            'provider' => 'manus',
            'provider_subject' => $openId,
            'provider_email' => strtolower($email),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('morada_admin_users')->where('open_id', $openId)->update(['user_id' => $userId]);

        return ['user_id' => $userId, 'identity_id' => $identityId];
    }
}
