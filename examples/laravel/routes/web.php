<?php

use App\Http\Controllers\ZapmizerEmbedSessionController;
use Illuminate\Support\Facades\Route;

// Rotas web: passam pela sessão e pelo CSRF do app. É isso que faz 401/419 significarem "a sessão do app caiu".
Route::middleware('auth')->group(function () {
    Route::post('atendimento/zapmizer-embed-session', [ZapmizerEmbedSessionController::class, 'inbox'])
        ->middleware('throttle:30,1');

    Route::post('customers/{customer}/zapmizer-embed-session', [ZapmizerEmbedSessionController::class, 'conversation'])
        ->middleware('throttle:30,1');

    Route::get('atendimento/keepalive', fn () => response()->noContent());
});
