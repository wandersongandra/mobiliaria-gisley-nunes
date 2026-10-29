<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('morada_staff_access', function (Blueprint $table): void {
            $table->string('address', 500)->nullable();
            $table->date('birth_date')->nullable();
        });

        Schema::table('morada_properties', function (Blueprint $table): void {
            $table->string('created_by_open_id', 191)->nullable();
            $table->index(['created_by_open_id', 'status']);
        });

        Schema::create('morada_lead_activities', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->char('lead_id', 36);
            $table->string('actor_open_id', 191)->nullable();
            $table->string('actor_email', 255);
            $table->string('type', 32)->default('note');
            $table->text('body');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('lead_id')->references('id')->on('morada_contact_leads')->cascadeOnDelete();
            $table->index(['lead_id', 'created_at']);
        });

        Schema::create('morada_form_templates', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->string('slug', 120)->unique();
            $table->string('title', 180);
            $table->string('description', 500)->nullable();
            $table->json('definition');
            $table->boolean('active')->default(true);
            $table->string('created_by_open_id', 191)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->index(['active', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('morada_form_templates');
        Schema::dropIfExists('morada_lead_activities');

        Schema::table('morada_properties', function (Blueprint $table): void {
            $table->dropIndex(['created_by_open_id', 'status']);
            $table->dropColumn('created_by_open_id');
        });

        Schema::table('morada_staff_access', function (Blueprint $table): void {
            $table->dropColumn(['address', 'birth_date']);
        });
    }
};
