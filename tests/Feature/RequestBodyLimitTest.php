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
        $payload = json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($payload);
        $this->assertSame('CONTENT_LENGTH_REQUIRED', $payload['error'] ?? null);
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
        $payload = json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($payload);
        $this->assertSame('PAYLOAD_TOO_LARGE', $payload['error'] ?? null);
    }

    public function test_multipart_without_content_length_is_rejected_instead_of_bypassing_the_limit(): void
    {
        $request = Request::create('/api/test', 'POST', server: [
            'CONTENT_TYPE' => 'multipart/form-data; boundary=example',
        ]);

        $response = app(LimitRequestBody::class)->handle(
            $request,
            static fn () => response('ok'),
            '64',
        );

        $this->assertSame(411, $response->getStatusCode());
        $this->assertStringContainsString('CONTENT_LENGTH_REQUIRED', (string) $response->getContent());
    }

    public function test_transfer_encoding_and_content_length_conflict_is_rejected(): void
    {
        $request = Request::create('/api/test', 'PUT', server: [
            'HTTP_TRANSFER_ENCODING' => 'chunked',
            'CONTENT_LENGTH' => '12',
        ], content: 'example-body');

        $response = app(LimitRequestBody::class)->handle(
            $request,
            static fn () => response('ok'),
            '64',
        );

        $this->assertSame(400, $response->getStatusCode());
        $this->assertStringContainsString('AMBIGUOUS_REQUEST_LENGTH', (string) $response->getContent());
    }
}
