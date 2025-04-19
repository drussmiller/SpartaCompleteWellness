
#!/bin/bash
timestamp=$(date +%Y%m%d_%H%M%S)
backup_file="db_backup_${timestamp}.sql"
pg_dump -U postgres $DATABASE_URL > "./backups/${backup_file}"
