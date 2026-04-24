/**
 * Re-export and wire-up for the RAG service.
 *
 * Importing this module has the side-effect of registering the Pinecone-backed
 * vector store as the default implementation of `VectorStorePort`. That keeps
 * the import chain obvious for Cloud Functions handlers that need retrieval:
 *
 *   import { retrieveRagContext } from "./services/ai/ragService";
 *
 * Tests that want a fake store can call `configureVectorStore(...)` with
 * their own implementation; the last call wins.
 */

import { configureVectorStore } from "@realyn/ai-core";
import { pineconeVectorStore } from "./pineconeVectorStore";

// Side-effect registration. Safe to run at import time — it only caches the
// store reference; the underlying Pinecone client is still lazy.
configureVectorStore(pineconeVectorStore);

export * from "@realyn/ai-core/services/ragService";
