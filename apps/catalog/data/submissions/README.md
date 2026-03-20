# Submission Storage

This directory holds file-backed package submissions for the catalog review workflow.

Status directories:
- `pending`
- `approved`
- `rejected`
- `needs_changes`

Important:
- submission records may contain private contact details such as Discord usernames
- these records are reviewed from the protected `/admin` page inside the catalog service
- these records are not part of the public catalog API
- do not publish or expose this directory as a static asset path
