<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('morada_panel_notifications', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->string('recipient_email', 255);
            $table->char('lead_id', 36);
            $table->string('kind', 24);
            $table->string('dedupe_key', 191)->unique();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('lead_id')->references('id')->on('morada_contact_leads')->cascadeOnDelete();
            $table->index(['recipient_email', 'read_at', 'created_at'], 'morada_notifications_recipient_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('morada_panel_notifications');
    }
};
