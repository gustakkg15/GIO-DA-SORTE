import { useEffect, useState, useCallback, useRef } from 'react';
import { Participant, RaffleSettings, Winner } from '../types';
import { idleStorage, AutoSaveStatus } from '../utils/idleStorage';

interface UseIdleAutoSaveProps {
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  isDrawing?: boolean;
}

export function useIdleAutoSave({
  settings,
  participants,
  winners,
  isDrawing = false,
}: UseIdleAutoSaveProps) {
  const [status, setStatus] = useState<AutoSaveStatus>(() => idleStorage.getStatus());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => idleStorage.getLastSavedAt());
  const isFirstMount = useRef(true);

  // Subscribe to controller status updates
  useEffect(() => {
    const unsubscribe = idleStorage.subscribe((newStatus, savedTime) => {
      setStatus(newStatus);
      setLastSavedAt(savedTime);
    });
    return unsubscribe;
  }, []);

  // When data changes, queue idle save
  useEffect(() => {
    // Avoid re-writing identical initial state on first mount
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    // If currently drawing, defer without urgency so animations remain 60fps
    idleStorage.scheduleSave({ settings, participants, winners }, false);
  }, [settings, participants, winners, isDrawing]);

  const flushNow = useCallback(() => {
    return idleStorage.flush();
  }, []);

  return {
    autoSaveStatus: status,
    lastSavedAt,
    flushNow,
  };
}
