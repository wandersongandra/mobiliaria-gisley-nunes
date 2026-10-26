<?php

namespace Tests\Feature;

use App\Http\Middleware\LimitRequestBody;
use Illuminate\Http\Request;
use Tests\TestCase;

class RequestBodyLimitTest extends TestCase
{
    public function test_chunked_request_without_content_length_is_rejected_before_body_read(): void
    {
        $request = Request::create(
            '/api/test',
            'POST',
            server: ['HTTP_TRANSFER_ENCODING' => 'chunked'],
            content: '{"message":"test"}',
        );

        $response = app(LimitRequestBody::class)->handle(
            $request,
            static fn () => response('ok'),
            '64',
        );

        $this->assertSame(411, $response->getStatusCode());
        $this->assertSame('CONTENT_LENGTH_REQUIRED', $response->getData(true)['error']);
    }

    public function test_declared_payload_over_limit_is_rejected_without_reading_the_body(): void
    {
        $request = Request::create(
            '/api/test',
            'POST',
            server: ['CONTENT_LENGTH' => '131073'],
            content: '',
        );

        $response = app(LimitRequestBody::class)->handle(
            $request,
            static fn () => response('ok'),
            '128',
        );

        $this->assertSame(413, $response->getStatusCode());
        $this->assertSame('PAYLOAD_TOO_LARGE', $response->getData(true)['error']);
    }
}
