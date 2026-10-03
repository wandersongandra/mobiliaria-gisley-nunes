<?php

namespace App\Console\Commands;

use App\Services\PropertyService;
use App\Services\R2Storage;
use DateTimeInterface;
use Illuminate\Console\Command;

class CleanupOrphanedPropertyUploads extends Command
{
    protected $signature = 'gisley:cleanup-orphaned-property-uploads';

    protected $description = 'Remove old R2 property uploads that were never registered';

    private const MAX_AGE_HOURS = 24;

    public function handle(PropertyService $properties, R2Storage $storage): int
    {
        $cutoff = now()->subHours(self::MAX_AGE_HOURS)->getTimestamp();
        $continuationToken = null;
        $scanned = 0;
        $removed = 0;

        do {
            $page = $storage->listPropertyObjects($continuationToken);
            $scanned += count($page['objects']);
            $oldObjects = array_values(array_filter(
                $page['objects'],
                static fn (array $object): bool => isset($object['key'], $object['last_modified'])
                    && is_string($object['key'])
                    && $object['last_modified'] instanceof DateTimeInterface
                    && $object['last_modified']->getTimestamp() <= $cutoff
            ));

            $registered = [];
            foreach (array_chunk(array_column($oldObjects, 'key'), 500) as $paths) {
                foreach ($properties->registeredStoragePaths($paths) as $path) {
                    $registered[$path] = true;
                }
            }

            foreach ($oldObjects as $object) {
                if (isset($registered[$object['key']])) {
                    continue;
                }

                $storage->delete($object['key']);
                $removed++;
            }

            $continuationToken = $page['next_token'];
        } while ($continuationToken !== null);

        $this->info(sprintf(
            'Scanned %d R2 objects; removed %d orphan upload(s) older than %d hours.',
            $scanned,
            $removed,
            self::MAX_AGE_HOURS
        ));

        return self::SUCCESS;
    }
}
