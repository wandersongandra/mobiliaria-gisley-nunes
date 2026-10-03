<?php

namespace Tests\Feature;

use App\Support\Clock;
use App\Support\Tokens;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SupportPrimitivesTest extends TestCase
{
    public function test_random_token_of_32_bytes_matches_the_invitation_regex(): void
    {
        $token = Tokens::random(32);

        $this->assertSame(43, strlen($token));
        $this->assertSame(1, preg_match('/^[A-Za-z0-9_-]{43}$/', $token));
    }

    public function test_random_token_never_emits_padding_or_non_url_alphabet(): void
    {
        for ($i = 0; $i < 50; $i++) {
            $token = Tokens::random(32);

            $this->assertStringNotContainsString('+', $token);
            $this->assertStringNotContainsString('/', $token);
            $this->assertStringNotContainsString('=', $token);
        }
    }

    public function test_random_tokens_are_distinct(): void
    {
        $tokens = [];
        for ($i = 0; $i < 50; $i++) {
            $tokens[] = Tokens::random(32);
        }

        $this->assertCount(50, array_unique($tokens));
    }

    public function test_token_length_scales_with_the_requested_byte_count(): void
    {
        $this->assertSame(22, strlen(Tokens::random(16)));
        $this->assertSame(43, strlen(Tokens::random(32)));
        $this->assertSame(86, strlen(Tokens::random(64)));
    }

    public function test_clock_tracks_real_time_by_default(): void
    {
        $now = Clock::nowMs();
        $wallClockMs = microtime(true) * 1000;

        $this->assertLessThanOrEqual(
            5.0,
            abs($now - $wallClockMs),
            'Clock::nowMs() divergiu do relógio real além da tolerância.'
        );
    }

    public function test_clock_truncates_sub_millisecond_precision_instead_of_rounding(): void
    {
        $frozen = Carbon::createFromFormat('Y-m-d H:i:s.u', '2026-01-01 12:00:00.999900', 'UTC');
        Carbon::setTestNow($frozen);

        try {
            $expected = Carbon::createFromFormat('Y-m-d H:i:s', '2026-01-01 12:00:00', 'UTC')->getTimestamp() * 1000 + 999;

            $this->assertSame($expected, Clock::nowMs());
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_clock_can_travel_in_time_for_expiry_tests(): void
    {
        $frozen = Carbon::create(2026, 1, 1, 12, 0, 0, 'UTC');
        Carbon::setTestNow($frozen);

        try {
            $this->assertSame($frozen->getTimestamp() * 1000, Clock::nowMs());

            $this->travel(90)->seconds();
            $this->assertSame(($frozen->getTimestamp() + 90) * 1000, Clock::nowMs());
        } finally {
            Carbon::setTestNow();
        }
    }
}
