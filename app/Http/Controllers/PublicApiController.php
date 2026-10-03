<?php

namespace App\Http\Controllers;

use App\Services\CrmService;
use App\Services\PropertyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicApiController extends Controller
{
    public function __construct(
        private readonly PropertyService $properties,
        private readonly CrmService $crm,
    ) {}

    public function properties(): JsonResponse
    {
        return response()->json([
            'properties' => $this->properties->publicCatalog(),
        ])->header(
            'Cache-Control',
            'public, max-age='.PropertyService::PUBLIC_CATALOG_TTL.', stale-while-revalidate=300'
        );
    }

    public function property(string $slug): JsonResponse
    {
        $row = $this->properties->getPropertyBySlug($slug);
        if (! $row) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->json([
            'property' => $this->properties->publicProperty($row),
        ])->header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }

    public function site(): JsonResponse
    {
        return response()->json([
            'site' => $this->crm->getSiteInfo(),
            'testimonials' => $this->crm->listTestimonials(),
        ])->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    }

    /**
     * O campo "website" é um honeypot: preenchido, indica bot. A resposta é
     * deliberadamente idêntica à de sucesso para não revelar o mecanismo.
     */
    public function contact(Request $request): JsonResponse
    {
        if (trim((string) $request->input('website', '')) !== '') {
            return response()->json(['ok' => true], 201);
        }

        $id = $this->crm->createContactLead($request->all());

        return response()->json(['ok' => true, 'id' => $id], 201);
    }
}
