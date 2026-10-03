<?php

namespace App\Console\Commands;

use App\Services\CrmService;
use Illuminate\Console\Command;

class AnonymizeExpiredLeads extends Command
{
    protected $signature = 'gisley:anonymize-expired-leads';

    protected $description = 'Anonymize closed and lost leads older than two years';

    public function handle(CrmService $crm): int
    {
        $anonymized = $crm->anonymizeExpiredLeads();
        $this->info(sprintf('Anonymized %d expired lead(s).', $anonymized));

        return self::SUCCESS;
    }
}
