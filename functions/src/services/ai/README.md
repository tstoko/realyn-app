# AI services (consumption-edge)

This folder is the **Cloud Functions–side adapter layer** for AI services. The real domain logic lives in `packages/ai-core/`; almost everything here is either a 4-line re-export or a thin Firestore/Pinecone adapter.

See `docs/architecture/ai-services.md` for the ports-and-adapters breakdown, why it's split this way, and what lives where.
