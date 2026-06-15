# Operator details

Used in legal pages and public copy. Quizzora is run voluntarily as a **hobby project** — not a registered business.

| Field | Value |
|-------|--------|
| **Operator** | Mr Vineel Davuluri (individual hobby project) |
| **Product** | Quizzora |
| **Support contact** | `support@quizzora.org` (override with `OPERATOR_CONTACT_EMAIL` in `.env.local`) |

Public legal pages and footer show the **operator name** and hobby context. The **product brand** remains Quizzora. No ABN is shown by default.

Override via environment variables if needed:

```env
OPERATOR_LEGAL_NAME=Mr Vineel Davuluri
OPERATOR_PRODUCT_NAME=Quizzora
OPERATOR_CONTACT_EMAIL=support@quizzora.org
# Optional legacy ABN (leave unset for hobby operation):
# OPERATOR_ABN=
```
