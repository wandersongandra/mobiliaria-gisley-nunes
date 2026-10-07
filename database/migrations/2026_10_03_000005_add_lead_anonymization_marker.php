<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('morada_contact_leads', function (Blueprint $table): void {
            $table->timestamp('anonymized_at')->nullable()->after('updated_at');
            $table->index(['anonymized_at', 'status', 'updated_at'], 'morada_leads_anonymization_due_index');
        });
    }

    public function down(): void
    {
        Schema::table('morada_contact_leads', function (Blueprint $table): void {
            $table->dropIndex('morada_leads_anonymization_due_index');
            $table->dropColumn('anonymized_at');
        });
    }
};
