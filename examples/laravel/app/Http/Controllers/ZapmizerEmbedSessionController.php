<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class ZapmizerEmbedSessionController extends Controller
{
    public function inbox(Request $request): JsonResponse
    {
        return $this->open($request, ['component' => 'inbox']);
    }

    public function conversation(Request $request, Customer $customer): JsonResponse
    {
        $appearance = $request->validate([
            'theme' => ['required', 'in:light,dark'],
            'color_primary' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'radius' => ['nullable', 'integer', 'between:0,24'],
            'font_family' => ['nullable', 'string', 'max:60', 'regex:/^[A-Za-z0-9 -]+$/'],
        ]);

        if (blank($customer->phone)) {
            return response()->json(['code' => 'customer_without_phone'], 422);
        }

        return $this->open($request, [
            'component' => 'conversation',
            'phone' => $customer->phone,
            'appearance' => array_filter($appearance, fn ($value) => $value !== null),
        ]);
    }

    private function open(Request $request, array $payload): JsonResponse
    {
        try {
            $response = Http::baseUrl(config('services.zapmizer.base_uri'))
                ->acceptJson()
                ->withToken($request->user()->team->zapmizer_api_key) // a chave da integração do time, nunca no front
                ->timeout(10)
                ->post('embed/sessions', [
                    ...$payload,
                    // Atrás de proxy, sem TrustProxies, isso sai http:// ou com o host interno, e a API responde origin_not_allowed.
                    'parent_origin' => $request->getSchemeAndHttpHost(),
                    'user' => ['id' => (string) $request->user()->id, 'name' => $request->user()->name],
                ]);
        } catch (ConnectionException) {
            return response()->json(['code' => 'unavailable'], 503);
        }

        if ($response->status() === 201 && is_string($url = $response->json('url')) && ($origin = $this->origin($url)) !== null) {
            return response()->json([
                'url' => $url,
                'origin' => $origin,
                'resume_url' => $response->json('resume_url'),
                'resume_until' => $response->json('resume_until'),
            ]);
        }

        // 401 da API = a chave foi revogada. Repassado como 401, a lib leria "a sessão do app caiu" e pediria reload.
        if ($response->status() === 401 || $response->status() === 419) {
            return response()->json(['code' => 'reauth_required'], 422);
        }

        if ($response->status() === 201 || $response->serverError()) {
            return response()->json(['code' => 'unavailable'], 503);
        }

        $retryAfter = $response->header('Retry-After');
        $headers = $response->status() === 429 && ctype_digit($retryAfter) ? ['Retry-After' => $retryAfter] : [];
        $error = $response->json('error');

        // A API manda o motivo em `error`; a lib lê `code`.
        return response()->json(['code' => is_string($error) ? $error : null], $response->status(), $headers);
    }

    private function origin(string $url): ?string
    {
        $parts = parse_url($url);

        if (! is_array($parts) || ! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || ! isset($parts['host'])) {
            return null;
        }

        $scheme = strtolower($parts['scheme']);
        $port = isset($parts['port']) && $parts['port'] !== ['http' => 80, 'https' => 443][$scheme] ? ':'.$parts['port'] : '';

        return $scheme.'://'.strtolower($parts['host']).$port;
    }
}
