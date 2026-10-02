<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('morada_admin_users', function (Blueprint $table): void {
            $table->string('open_id', 191)->primary();
            $table->string('email', 255)->unique();
            $table->string('name', 255);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('last_login_at')->useCurrent();
        });

        Schema::create('morada_staff_access', function (Blueprint $table): void {
            $table->string('email', 255)->primary();
            $table->string('open_id', 191)->nullable()->unique();
            $table->string('name', 255);
            $table->string('role', 20)->default('editor');
            $table->boolean('active')->default(true);
            $table->string('invited_by', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->index(['role', 'active']);
        });

        Schema::create('morada_staff_invitations', function (Blueprint $table): void {
            $table->char('token_hash', 64)->primary();
            $table->string('email', 255);
            $table->string('name', 255);
            $table->string('role', 20)->default('editor');
            $table->string('invited_by', 255);
            $table->unsignedBigInteger('expires_at_ms');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['email', 'expires_at_ms']);
            $table->index('expires_at_ms');
        });

        Schema::create('morada_identity_pairings', function (Blueprint $table): void {
            $table->char('code_hash', 64)->primary();
            $table->string('open_id', 191)->unique();
            $table->string('email', 255)->unique();
            $table->unsignedBigInteger('expires_at_ms');
            $table->timestamp('created_at')->useCurrent();
            $table->index('expires_at_ms');
        });

        Schema::create('morada_auth_challenges', function (Blueprint $table): void {
            $table->char('state_hash', 64)->primary();
            $table->string('redirect_uri', 500);
            $table->char('invitation_hash', 64)->nullable();
            $table->unsignedBigInteger('expires_at_ms');
            $table->timestamp('created_at')->useCurrent();
            $table->index('expires_at_ms');
        });

        Schema::create('morada_admin_sessions', function (Blueprint $table): void {
            $table->char('jti', 36)->primary();
            $table->string('open_id', 191);
            $table->string('email', 255);
            $table->unsignedBigInteger('expires_at_ms');
            $table->unsignedBigInteger('last_seen_at_ms')->default(0);
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['open_id', 'expires_at_ms']);
            $table->index(['email', 'expires_at_ms']);
            $table->index(['revoked_at', 'expires_at_ms']);
        });

        Schema::create('morada_properties', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->string('title', 160);
            $table->string('slug', 180)->unique();
            $table->string('location', 180);
            $table->string('city', 120);
            $table->string('purpose', 30);
            $table->string('type', 50);
            $table->decimal('price', 14, 2)->default(0);
            $table->string('price_label', 100);
            $table->integer('bedrooms')->default(0);
            $table->integer('bathrooms')->default(0);
            $table->decimal('area_m2', 10, 2)->default(0);
            $table->integer('suites')->default(0);
            $table->integer('parking_spots')->default(0);
            $table->decimal('condo_fee', 10, 2)->default(0);
            $table->decimal('iptu', 12, 2)->default(0);
            $table->text('description')->nullable();
            $table->string('status', 20)->default('draft');
            $table->boolean('is_featured')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->index(['status', 'updated_at']);
            $table->index(['is_featured', 'updated_at']);
        });

        Schema::create('morada_property_photos', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->char('property_id', 36);
            $table->string('storage_path', 500)->unique();
            $table->string('url', 600);
            $table->string('alt_text', 255);
            $table->integer('sort_order')->default(0);
            $table->boolean('is_cover')->default(false);
            $table->string('storage_provider', 20)->default('r2');
            $table->string('mime_type', 80)->nullable();
            $table->unsignedBigInteger('file_size')->default(0);
            $table->unsignedInteger('width')->default(0);
            $table->unsignedInteger('height')->default(0);
            $table->string('uploaded_by', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('property_id')->references('id')->on('morada_properties')->cascadeOnDelete();
            $table->index('property_id');
        });

        Schema::create('morada_site_settings', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary()->default(1);
            $table->string('phone_display', 50)->nullable();
            $table->string('whatsapp', 30)->nullable();
            $table->string('email', 120)->nullable();
            $table->string('address', 180)->nullable();
            $table->string('crci', 30)->nullable();
            $table->string('area', 120)->nullable();
            $table->string('instagram_url', 200)->nullable();
            $table->string('instagram_display', 60)->nullable();
            $table->timestamp('updated_at')->useCurrent();
        });

        Schema::create('morada_testimonials', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->string('author', 120);
            $table->text('quote');
            $table->string('location', 120)->nullable();
            $table->string('year', 10)->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('morada_audit_log', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->string('actor_email', 255);
            $table->string('actor_open_id', 191)->nullable();
            $table->string('action', 80);
            $table->string('entity_type', 60);
            $table->string('entity_id', 191)->nullable();
            $table->json('details')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index('created_at');
            $table->index(['actor_email', 'created_at']);
            $table->index(['entity_type', 'entity_id', 'created_at']);
        });

        Schema::create('morada_contact_leads', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->string('name', 120);
            $table->string('email', 255);
            $table->string('interest', 100);
            $table->text('message');
            $table->string('property_path', 240)->nullable();
            $table->string('status', 20)->default('new');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('morada_contact_leads');
        Schema::dropIfExists('morada_audit_log');
        Schema::dropIfExists('morada_testimonials');
        Schema::dropIfExists('morada_site_settings');
        Schema::dropIfExists('morada_property_photos');
        Schema::dropIfExists('morada_properties');
        Schema::dropIfExists('morada_admin_sessions');
        Schema::dropIfExists('morada_auth_challenges');
        Schema::dropIfExists('morada_identity_pairings');
        Schema::dropIfExists('morada_staff_invitations');
        Schema::dropIfExists('morada_staff_access');
        Schema::dropIfExists('morada_admin_users');
    }
};
