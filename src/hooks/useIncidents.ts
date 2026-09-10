// MARIS — React bindings for the centralized incident store.
import { useSyncExternalStore } from "react";
import {
  getIncidentStore,
  getSnapshot,
  subscribe,
  type IncidentStoreState,
} from "@/data/incidentStore";

export function useIncidentStore(): IncidentStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export { getIncidentStore };
