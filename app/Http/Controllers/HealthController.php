<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class HealthController extends Controller
{
    public function live(): JsonResponse
    {
        return response()->json(['status' => 'ok'])->header('Cache-Control', 'no-store');
    }

    public function ready(): JsonResponse
    {
        try {
            DB::connection()->getPdo();
            DB::select('SELECT 1');
        } catch (\Throwable $error) {
            Log::warning('health.ready.failed', ['exception' => $error::class]);

            return response()
                ->json(['error' => 'SERVICE_UNAVAILABLE'], 503)
                ->header('Cache-Control', 'no-store');
        }

        return response()->json(['status' => 'ok'])->header('Cache-Control', 'no-store');
    }
}
