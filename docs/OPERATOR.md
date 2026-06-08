# Operator details

Used in legal pages, school agreements, and compliance docs.

| Field | Value |
|-------|--------|
| **Legal operator** | Mr Vineel Davuluri (ABN 41 833 153 799) |
| **Product** | Quizzora |
| **Support contact** | `support@quizzora.org` (override with `OPERATOR_CONTACT_EMAIL` in `.env.local`) |

Public legal pages, footer, checkout copy, and Stripe portal headline show the **legal operator name and ABN**. The **product brand** remains Quizzora.

Override via environment variables if needed:

```env
OPERATOR_LEGAL_NAME=Mr Vineel Davuluri
OPERATOR_ABN=41 833 153 799
OPERATOR_PRODUCT_NAME=Quizzora
OPERATOR_CONTACT_EMAIL=support@quizzora.org
```
