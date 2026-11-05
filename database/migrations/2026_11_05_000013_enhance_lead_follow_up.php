<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('morada_contact_leads', function (Blueprint $table): void {
            $table->string('phone', 32)->nullable();
            $table->string('assigned_to_email', 255)->nullable();
            $table->date('follow_up_date')->nullable();
            $table->index(['follow_up_date', 'status'], 'morada_leads_follow_up_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('morada_contact_leads', function (Blueprint $table): void {
            $table->dropIndex('morada_leads_follow_up_status_index');
            $table->dropColumn(['phone', 'assigned_to_email', 'follow_up_date']);
        });
    }
};
