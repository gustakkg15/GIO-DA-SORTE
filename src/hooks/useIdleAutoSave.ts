import { useEffect, useState, useCallback, useRef } from 'react';
import { Participant, RaffleSettings, Winner } from '../types';
import { idleStorage, AutoSaveStatus } from '../utils/idleStorage';

interface UseIdleAutoSaveProps {
  ownerUid?: string | null;
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  isDrawing?: boolean;
}

export function useIdleAutoSave({
  ownerUid = null,
  settings,
  participants,
  winners,
  isDrawing = false,
}: UseIdleAutoSaveProps) {
  const [status, setStatus] = useState<AutoSaveStatus>(() => idleStorage.getStatus());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => idleStorage.getLastSavedAt());
  const isFirstMount = useRef(true);
  const lastOwnerUidRef = useRef<string | null>(ownerUid ?? null);

  // Subscribe to controller status updates
  useEffect(() => {
    const unsubscribe = idleStorage.subscribe((newStatus, savedTime) => {
      setStatus(newStatus);
      setLastSavedAt(savedTime);
    });
    return unsubscribe;
  }, []);

  // Synchronize active owner UID on idleStorage whenever auth identity changes
  useEffect(() => {
    const normalizedUid = ownerUid ?? null;
    if (lastOwnerUidRef.current !== normalizedUid) {
      lastOwnerUidRef.current = normalizedUid;
      idleStorage.setActiveOwnerUid(normalizedUid);
    }
  }, [ownerUid]);

  // When data changes, queue idle save
  useEffect(() => {
    // Avoid re-writing identical initial state on first mount
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    idleStorage.setActiveOwnerUid(ownerUid ?? null);
    // If currently drawing, defer without urgency so animations remain 60fps
    idleStorage.scheduleSave({ settings, participants, winners }, false);
  }, [ownerUid, settings, participants, winners, isDrawing]);

  const flushNow = useCallback(() => {
    return idleStorage.flush();
  }, []);

  return {
    autoSaveStatus: status,
    lastSavedAt,
    flushNow,
  };
}

