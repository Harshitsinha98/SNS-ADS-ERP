/**
 * Repository Layer barrel export.
 *
 * Usage:
 *   import { cachedGetDoc, subscribeTo, paginatedQuery } from "../repository";
 */
export {
  cachedGetDoc,
  invalidateDocCache,
  subscribeTo,
  subscribeToDoc,
  orgCollectionRef,
  orgDocRef,
  paginatedQuery,
  fetchPage,
  batchWrite,
  parallelGetDocs,
  db,
  collection,
  collectionGroup,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  getDoc,
  getDocs,
  writeBatch,
} from "./FirestoreRepository.js";
