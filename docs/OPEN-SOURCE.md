# Open source at Quizzora

Last updated: June 2026.

This document explains Quizzora’s open-source intent and how subscriptions relate to the project. It is **not legal advice** — read the [LICENSE](../LICENSE) and consult a lawyer for your own use.

## Mission

Quizzora is Australian curriculum ed-tech for secondary schools and families: teachers assign curriculum-aligned AI quizzes; students study with an assignment-scoped Study Coach before graded work unlocks. The product is built for Years 7–12, including VCE.

We publish the application source so schools, families, and developers can inspect how the platform works, self-host on their own infrastructure, and contribute improvements back to the community.

## License

Quizzora is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](../LICENSE).

### Why AGPL-3.0?

| Consideration | AGPL-3.0 | MIT (alternative) |
| --- | --- | --- |
| SaaS / hosted use | If you run a modified version as a network service, you must offer corresponding source to users who interact with it over the network. | No copyleft obligation for hosted-only use. |
| Ed-tech trust | Schools can verify behaviour and receive improvements when others extend the platform. | Maximum permissiveness; forks can stay closed. |
| Dependencies | Compatible with this project’s npm stack (MIT, Apache-2.0, BSD, LGPL as libraries). | Also compatible. |

We chose **AGPL-3.0** because Quizzora is primarily used as a hosted learning platform. AGPL keeps network deployments aligned with the community: improvements to the service are more likely to flow back. If you need a permissive license for a specific fork or integration, contact the operator — MIT remains a reasonable alternative for maximum adoption.

**Third-party libraries** remain under their own licenses (see `package-lock.json` and `npm` license metadata). AGPL applies to Quizzora’s own code.

## Source availability

The canonical source is public on GitHub: **[https://github.com/VineelD/quizzora](https://github.com/VineelD/quizzora)** (AGPL-3.0). Clone, build, and self-host from that repository; report bugs and contribute via issues and pull requests.

## Hosted service vs self-host

| | **[quizzora.org](https://quizzora.org)** (hosted) | **Self-host** |
| --- | --- | --- |
| Who runs it | Mr Vineel Davuluri (ABN 41 833 153 799), on-premises in Australia | You (school IT, family, or integrator) |
| Setup | Register school or family; Stripe subscription optional after trial | Clone source, configure env, run on your Windows/Linux server |
| Data location | Operator premises in Australia ([data hosting notes](./AU-COMPLIANCE.md)) | Your chosen infrastructure |
| AI & email | Operator-configured OpenAI and mail | Your API keys and SMTP |
| Billing | Stripe subscriptions fund the hosted service | No Quizzora subscription required; you pay your own hosting and API costs |
| Updates | Operator deploys | You pull/build/deploy |

**Self-host quick start:** see [README.md](../README.md) (local dev) and [WINDOWS-AUTO-START.md](./WINDOWS-AUTO-START.md) / IIS sections in the README for production-style Windows deployment.

## What subscriptions fund

Subscriptions on quizzora.org are **not** a paywall on the source code. They sustain the **hosted** service that many schools and families prefer not to run themselves:

1. **Hosting** — on-premises servers in Australia, backups, monitoring, and tunnel/DNS for quizzora.org.
2. **AI** — OpenAI usage for quiz generation, Study Coach, and related features within plan limits.
3. **Development** — curriculum updates, safety improvements, bug fixes, and new features for the shared codebase.

Paying subscribers help keep the hosted instance reliable and the project actively maintained. Self-hosters contribute by running their own stack and, under AGPL, sharing modifications when they offer the software as a network service.

## Contributing and sponsorship

- **Code:** Contributions are welcome via [issues and pull requests](https://github.com/VineelD/quizzora). See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup, AGPL terms, and PR guidelines. Email [support@quizzora.org](mailto:support@quizzora.org) for private coordination.
- **Curriculum & pedagogy:** Feedback on Australian alignment (ACARA / VCAA) is especially welcome — see [CURRICULUM-SOURCE.md](./CURRICULUM-SOURCE.md).
- **Sponsor via subscription:** Schools and families on quizzora.org directly fund hosting and development; there is no separate “donation tier” required.
- **Self-host feedback:** Report deployment issues so Windows/IIS and env documentation improve for everyone.

## Operator

**Quizzora** is operated by **Mr Vineel Davuluri (ABN 41 833 153 799)**.  
Support: [support@quizzora.org](mailto:support@quizzora.org)


## Open source and sole trader operation (not legal advice)

Many Australian sole traders run open-source projects and paid hosted services under their personal name and ABN. Releasing code under **AGPL-3.0** does not prevent operating **quizzora.org** as a subscription-funded SaaS or treating that revenue as ordinary business income. Your tax, liability, and structure depend on your circumstances—confirm with a qualified accountant or lawyer.
See also: [OPERATOR.md](./OPERATOR.md), [BILLING.md](./BILLING.md), [COMPETITIVE-POSITIONING.md](./COMPETITIVE-POSITIONING.md).

