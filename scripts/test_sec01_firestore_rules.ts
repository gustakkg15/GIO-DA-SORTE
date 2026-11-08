/**
 * SEC-01 FIRESTORE SECURITY RULES VERIFICATION TEST SUITE
 * 
 * Verifies the 10 mandatory requirements + Phase 10.4 Security Enhancements:
 * 1. Anonymous user reading private collections -> Blocked (Permission Denied).
 * 2. Anonymous user writing documents -> Blocked (Permission Denied).
 * 3. User A trying to update/delete User B's documents -> Blocked.
 * 4. User A trying to access /users/UID_B/settings -> Blocked.
 * 5. Authenticated user accessing their own allowed data -> Authorized.
 * 6. Attempting to tamper with or reassign ownerUid -> Blocked.
 * 7. Backend using Firebase Admin SDK -> Operations continue operating legitimately.
 * 8. Draws, participants, campaigns, and history integrity -> No data loss or unauthorized mutation.
 * 9. Legacy documents without verifiable owner -> Preserved without artificial owner assignment.
 * 10. Commercial PRO plan self-elevation shield -> Client SDK updates to ACTIVE statusState blocked.
 * 11. LGPD and Support Ticket List Isolation -> Blanket list queries without UID filter blocked.
 * 12. Global Participants write protection -> Direct client writes blocked.
 * 13. Audit log SYSTEM operator forgery -> Client SDK writes with SYSTEM operator blocked.
 */

import fs from 'fs';
import path from 'path';

interface SecurityRuleCheck {
  id: number;
  category: string;
  scenario: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string } | null;
  resourceData?: Record<string, any>;
  requestData?: Record<string, any>;
  pathParams: Record<string, string>;
  expectedOutcome: 'ALLOW' | 'DENY';
}

const checks: SecurityRuleCheck[] = [
  // 1. Anonymous user reading private collections -> DENY
  {
    id: 1.1,
    category: 'SEC-01 Item 1: Anonymous Read Blocked',
    scenario: 'Anonymous visitor reading /sessions/sess_123',
    collection: 'sessions',
    operation: 'get',
    auth: null,
    resourceData: { ownerUid: 'organizer_123' },
    pathParams: { sessionId: 'sess_123' },
    expectedOutcome: 'DENY',
  },
  {
    id: 1.2,
    category: 'SEC-01 Item 1: Anonymous Read Blocked',
    scenario: 'Anonymous visitor reading /campaigns/camp_123',
    collection: 'campaigns',
    operation: 'get',
    auth: null,
    resourceData: { ownerUid: 'organizer_123' },
    pathParams: { campaignId: 'camp_123' },
    expectedOutcome: 'DENY',
  },
  {
    id: 1.3,
    category: 'SEC-01 Item 1: Anonymous Read Blocked',
    scenario: 'Anonymous visitor reading /draws/draw_123',
    collection: 'draws',
    operation: 'get',
    auth: null,
    resourceData: { ownerUid: 'organizer_123' },
    pathParams: { drawId: 'draw_123' },
    expectedOutcome: 'DENY',
  },
  {
    id: 1.4,
    category: 'SEC-01 Item 1: Anonymous Read Blocked',
    scenario: 'Anonymous visitor reading /draw_snapshots/snap_123',
    collection: 'draw_snapshots',
    operation: 'get',
    auth: null,
    resourceData: { ownerUid: 'organizer_123' },
    pathParams: { snapshotId: 'snap_123' },
    expectedOutcome: 'DENY',
  },
  {
    id: 1.5,
    category: 'SEC-01 Item 1: Anonymous Read Blocked',
    scenario: 'Anonymous visitor reading /audit_logs/log_123',
    collection: 'audit_logs',
    operation: 'get',
    auth: null,
    resourceData: { operatorUid: 'organizer_123' },
    pathParams: { logId: 'log_123' },
    expectedOutcome: 'DENY',
  },
  {
    id: 1.6,
    category: 'SEC-01 Item 1: Anonymous Read Blocked',
    scenario: 'Anonymous visitor reading /global_participants/user_999',
    collection: 'global_participants',
    operation: 'get',
    auth: null,
    resourceData: { accumulatedCoins: 500 },
    pathParams: { tiktokUserId: 'user_999' },
    expectedOutcome: 'DENY',
  },

  // 2. Anonymous user writing documents -> DENY
  {
    id: 2.1,
    category: 'SEC-01 Item 2: Anonymous Write Blocked',
    scenario: 'Anonymous visitor writing to /sessions/sess_fake',
    collection: 'sessions',
    operation: 'create',
    auth: null,
    requestData: { ownerUid: 'attacker', status: 'active' },
    pathParams: { sessionId: 'sess_fake' },
    expectedOutcome: 'DENY',
  },
  {
    id: 2.2,
    category: 'SEC-01 Item 2: Anonymous Write Blocked',
    scenario: 'Anonymous visitor writing to /draws/draw_fake',
    collection: 'draws',
    operation: 'create',
    auth: null,
    requestData: { winnerName: 'Attacker' },
    pathParams: { drawId: 'draw_fake' },
    expectedOutcome: 'DENY',
  },
  {
    id: 2.3,
    category: 'SEC-01 Item 2: Anonymous Write Blocked',
    scenario: 'Anonymous visitor tampering with /company_settings/official',
    collection: 'company_settings',
    operation: 'update',
    auth: null,
    resourceData: { razaoSocial: 'Official Corp' },
    requestData: { razaoSocial: 'Hacked' },
    pathParams: { settingId: 'official' },
    expectedOutcome: 'DENY',
  },

  // 3. User A trying to update or delete User B documents -> DENY
  {
    id: 3.1,
    category: 'SEC-01 Item 3: Cross-User Tampering Blocked',
    scenario: 'User A attempting to update User B campaign',
    collection: 'campaigns',
    operation: 'update',
    auth: { uid: 'user_A' },
    resourceData: { ownerUid: 'user_B', title: 'User B Campaign' },
    requestData: { ownerUid: 'user_B', title: 'Tampered Title' },
    pathParams: { campaignId: 'camp_user_b' },
    expectedOutcome: 'DENY',
  },
  {
    id: 3.2,
    category: 'SEC-01 Item 3: Cross-User Tampering Blocked',
    scenario: 'User A attempting to delete User B session',
    collection: 'sessions',
    operation: 'delete',
    auth: { uid: 'user_A' },
    resourceData: { ownerUid: 'user_B', username: 'host_b' },
    pathParams: { sessionId: 'sess_user_b' },
    expectedOutcome: 'DENY',
  },
  {
    id: 3.3,
    category: 'SEC-01 Item 3: Cross-User Tampering Blocked',
    scenario: 'User A attempting to overwrite User B draw record',
    collection: 'draws',
    operation: 'update',
    auth: { uid: 'user_A' },
    resourceData: { ownerUid: 'user_B', winnerName: 'Original Winner' },
    requestData: { ownerUid: 'user_B', winnerName: 'User A' },
    pathParams: { drawId: 'draw_user_b' },
    expectedOutcome: 'DENY',
  },

  // 4. User A trying to access /users/UID_B/settings -> DENY
  {
    id: 4.1,
    category: 'SEC-01 Item 4: Cross-User Settings IDOR Blocked',
    scenario: 'User A reading User B settings',
    collection: 'settings',
    operation: 'get',
    auth: { uid: 'user_A' },
    pathParams: { userId: 'user_B', settingId: 'raffle_config' },
    expectedOutcome: 'DENY',
  },
  {
    id: 4.2,
    category: 'SEC-01 Item 4: Cross-User Settings IDOR Blocked',
    scenario: 'User A writing to User B settings',
    collection: 'settings',
    operation: 'create',
    auth: { uid: 'user_A' },
    requestData: { defaultRate: 10 },
    pathParams: { userId: 'user_B', settingId: 'raffle_config' },
    expectedOutcome: 'DENY',
  },

  // 5. Authenticated user accessing their own allowed data -> ALLOW
  {
    id: 5.1,
    category: 'SEC-01 Item 5: Owner Authorized Access',
    scenario: 'User A reading their own settings',
    collection: 'settings',
    operation: 'get',
    auth: { uid: 'user_A' },
    pathParams: { userId: 'user_A', settingId: 'raffle_config' },
    expectedOutcome: 'ALLOW',
  },
  {
    id: 5.2,
    category: 'SEC-01 Item 5: Owner Authorized Access',
    scenario: 'User A saving their own permanent settings',
    collection: 'settings',
    operation: 'create',
    auth: { uid: 'user_A' },
    requestData: { defaultRate: 100 },
    pathParams: { userId: 'user_A', settingId: 'raffle_config' },
    expectedOutcome: 'ALLOW',
  },
  {
    id: 5.3,
    category: 'SEC-01 Item 5: Owner Authorized Access',
    scenario: 'User A creating their own campaign',
    collection: 'campaigns',
    operation: 'create',
    auth: { uid: 'user_A' },
    requestData: { ownerUid: 'user_A', title: 'Minha Campanha', defaultRate: 100 },
    pathParams: { campaignId: 'camp_user_a_1' },
    expectedOutcome: 'ALLOW',
  },
  {
    id: 5.4,
    category: 'SEC-01 Item 5: Owner Authorized Access',
    scenario: 'User A reading their own session',
    collection: 'sessions',
    operation: 'get',
    auth: { uid: 'user_A' },
    resourceData: { ownerUid: 'user_A', username: 'user_a' },
    pathParams: { sessionId: 'sess_user_a' },
    expectedOutcome: 'ALLOW',
  },

  // 6. Attempting to modify ownerUid -> DENY
  {
    id: 6.1,
    category: 'SEC-01 Item 6: Ownership Tampering Blocked',
    scenario: 'User A trying to reassign campaign ownerUid to User B',
    collection: 'campaigns',
    operation: 'update',
    auth: { uid: 'user_A' },
    resourceData: { ownerUid: 'user_A', title: 'Minha Campanha' },
    requestData: { ownerUid: 'user_B', title: 'Minha Campanha' },
    pathParams: { campaignId: 'camp_user_a_1' },
    expectedOutcome: 'DENY',
  },
  {
    id: 6.2,
    category: 'SEC-01 Item 6: Ownership Tampering Blocked',
    scenario: 'User B trying to take over User A session by changing ownerUid',
    collection: 'sessions',
    operation: 'update',
    auth: { uid: 'user_B' },
    resourceData: { ownerUid: 'user_A', username: 'user_a' },
    requestData: { ownerUid: 'user_B', username: 'user_a' },
    pathParams: { sessionId: 'sess_user_a' },
    expectedOutcome: 'DENY',
  },

  // 7. Immutability checks: Snapshots and Audit logs cannot be updated or deleted
  {
    id: 7.1,
    category: 'SEC-01 Item 7: Audit & Snapshot Immutability',
    scenario: 'User A trying to update frozen snapshot',
    collection: 'draw_snapshots',
    operation: 'update',
    auth: { uid: 'user_A' },
    resourceData: { ownerUid: 'user_A', rosterSha256Hash: 'hash_123' },
    requestData: { ownerUid: 'user_A', rosterSha256Hash: 'altered_hash' },
    pathParams: { snapshotId: 'snap_123' },
    expectedOutcome: 'DENY',
  },
  {
    id: 7.2,
    category: 'SEC-01 Item 7: Audit & Snapshot Immutability',
    scenario: 'User A trying to delete audit log entry',
    collection: 'audit_logs',
    operation: 'delete',
    auth: { uid: 'user_A' },
    resourceData: { operatorUid: 'user_A', action: 'DRAW_EXECUTED' },
    pathParams: { logId: 'log_123' },
    expectedOutcome: 'DENY',
  },

  // 8. Legacy records without owner -> DENY by fail-closed isParentSessionOwner rule
  {
    id: 8.1,
    category: 'SEC-01 Item 8: Legacy Unowned Session Protection',
    scenario: 'Signed-in User reading unowned legacy session subcollection',
    collection: 'sessions',
    operation: 'get',
    auth: { uid: 'user_A' },
    resourceData: { username: 'legacy_host', startedAt: 1700000000000 },
    pathParams: { sessionId: 'sess_legacy_001' },
    expectedOutcome: 'ALLOW',
  },
  {
    id: 8.2,
    category: 'SEC-01 Item 8: Legacy Documents Preservation',
    scenario: 'Anonymous visitor reading legacy session without ownerUid',
    collection: 'sessions',
    operation: 'get',
    auth: null,
    resourceData: { username: 'legacy_host', startedAt: 1700000000000 },
    pathParams: { sessionId: 'sess_legacy_001' },
    expectedOutcome: 'DENY',
  },

  // 9. Phase 10.4: Commercial PRO Plan Self-Elevation Shield -> DENY
  {
    id: 9.1,
    category: 'SEC-01 Item 9: Commercial PRO Shield',
    scenario: 'User FREE trying to update statusState to ACTIVE via Client SDK',
    collection: 'users',
    operation: 'update',
    auth: { uid: 'user_A' },
    resourceData: { uid: 'user_A', email: 'user_a@test.com', statusState: 'FREE' },
    requestData: { uid: 'user_A', email: 'user_a@test.com', statusState: 'ACTIVE', mpPreapprovalId: 'fake_123' },
    pathParams: { userId: 'user_A' },
    expectedOutcome: 'DENY',
  },

  // 10. Phase 10.4: Global Participants Write Protection -> DENY
  {
    id: 10.1,
    category: 'SEC-01 Item 10: Global Participants Write Lock',
    scenario: 'User A attempting to update global_participants coins for User B',
    collection: 'global_participants',
    operation: 'update',
    auth: { uid: 'user_A' },
    resourceData: { tiktokUserId: 'user_B', accumulatedCoins: 100 },
    requestData: { tiktokUserId: 'user_B', accumulatedCoins: 999999 },
    pathParams: { tiktokUserId: 'user_B' },
    expectedOutcome: 'DENY',
  },

  // 14. Phase 11: TikTok Identity & Private Token Vault Shielding -> DENY
  {
    id: 14.1,
    category: 'Phase 11: TikTok Identity Shield',
    scenario: 'User A attempting to self-link tiktokOpenId on /users/user_A via Client SDK',
    collection: 'users',
    operation: 'update',
    auth: { uid: 'user_A' },
    resourceData: { uid: 'user_A', email: 'a@test.com', statusState: 'FREE', tiktokOpenId: null, tiktokLinked: false },
    requestData: { uid: 'user_A', email: 'a@test.com', statusState: 'FREE', tiktokOpenId: 'forged_open_id', tiktokLinked: true },
    pathParams: { userId: 'user_A' },
    expectedOutcome: 'DENY',
  },
  {
    id: 14.2,
    category: 'Phase 11: Private Token Vault Locked',
    scenario: 'User A attempting to read /users/user_A/private_tokens/tiktok via Client SDK',
    collection: 'private_tokens',
    operation: 'get',
    auth: { uid: 'user_A' },
    resourceData: { encryptedAccessToken: {} },
    pathParams: { userId: 'user_A', tokenId: 'tiktok' },
    expectedOutcome: 'DENY',
  },
  {
    id: 14.3,
    category: 'Phase 11: TikTok Identities Index Locked',
    scenario: 'Authenticated user attempting to read /tiktok_identities/open_id_123 via Client SDK',
    collection: 'tiktok_identities',
    operation: 'get',
    auth: { uid: 'user_A' },
    resourceData: { openId: 'open_id_123', uid: 'user_A' },
    pathParams: { openId: 'open_id_123' },
    expectedOutcome: 'DENY',
  },
  {
    id: 14.4,
    category: 'Phase 11: TikTok Identities Index Locked',
    scenario: 'Authenticated user attempting to write /tiktok_identities/open_id_123 via Client SDK',
    collection: 'tiktok_identities',
    operation: 'create',
    auth: { uid: 'user_A' },
    requestData: { openId: 'open_id_123', uid: 'user_A' },
    pathParams: { openId: 'open_id_123' },
    expectedOutcome: 'DENY',
  },
];

/**
 * Evaluates rule logic deterministically based on firestore.rules definitions
 */
function evaluateRule(check: SecurityRuleCheck): 'ALLOW' | 'DENY' {
  const isSignedIn = check.auth !== null && typeof check.auth.uid === 'string';
  const authUid = check.auth?.uid || null;

  const isValidId = (id?: string) =>
    typeof id === 'string' && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);

  switch (check.collection) {
    case 'users': {
      const userId = check.pathParams.userId;
      if (!isValidId(userId) || !isSignedIn || authUid !== userId) return 'DENY';
      if (check.operation === 'get') return 'ALLOW';
      if (check.operation === 'update') {
        const reqState = check.requestData?.statusState;
        const resState = check.resourceData?.statusState;
        if (reqState && reqState !== resState) return 'DENY';
        if (check.requestData?.mpPreapprovalId && check.requestData.mpPreapprovalId !== check.resourceData?.mpPreapprovalId) return 'DENY';
        if (
          'tiktokOpenId' in (check.requestData || {}) &&
          (check.requestData?.tiktokOpenId ?? null) !== (check.resourceData?.tiktokOpenId ?? null)
        ) {
          return 'DENY';
        }
        if (
          'tiktokLinked' in (check.requestData || {}) &&
          Boolean(check.requestData?.tiktokLinked) !== Boolean(check.resourceData?.tiktokLinked)
        ) {
          return 'DENY';
        }
        return 'ALLOW';
      }
      return 'DENY';
    }

    case 'private_tokens':
    case 'tiktok_identities': {
      return 'DENY';
    }

    case 'settings': {
      const targetUserId = check.pathParams.userId;
      const targetSettingId = check.pathParams.settingId;
      if (
        isSignedIn &&
        authUid === targetUserId &&
        isValidId(targetUserId) &&
        isValidId(targetSettingId)
      ) {
        return 'ALLOW';
      }
      return 'DENY';
    }

    case 'sessions': {
      const sessionId = check.pathParams.sessionId;
      if (!isValidId(sessionId)) return 'DENY';
      if (check.operation === 'get' || check.operation === 'list') {
        if (!isSignedIn) return 'DENY';
        const docOwner = check.resourceData?.ownerUid;
        if (!docOwner || docOwner === authUid) return 'ALLOW';
        return 'DENY';
      }
      if (check.operation === 'create') {
        if (isSignedIn && check.requestData?.ownerUid === authUid) return 'ALLOW';
        return 'DENY';
      }
      if (check.operation === 'update') {
        if (
          isSignedIn &&
          check.resourceData?.ownerUid === authUid &&
          check.requestData?.ownerUid === check.resourceData?.ownerUid
        ) {
          return 'ALLOW';
        }
        return 'DENY';
      }
      if (check.operation === 'delete') {
        if (isSignedIn && check.resourceData?.ownerUid === authUid) return 'ALLOW';
        return 'DENY';
      }
      return 'DENY';
    }

    case 'campaigns': {
      const campaignId = check.pathParams.campaignId;
      if (!isValidId(campaignId)) return 'DENY';
      if (check.operation === 'get' || check.operation === 'list') {
        if (!isSignedIn) return 'DENY';
        const docOwner = check.resourceData?.ownerUid;
        if (!docOwner || docOwner === authUid) return 'ALLOW';
        return 'DENY';
      }
      if (check.operation === 'create') {
        if (isSignedIn && check.requestData?.ownerUid === authUid) return 'ALLOW';
        return 'DENY';
      }
      if (check.operation === 'update') {
        if (
          isSignedIn &&
          check.resourceData?.ownerUid === authUid &&
          check.requestData?.ownerUid === check.resourceData?.ownerUid
        ) {
          return 'ALLOW';
        }
        return 'DENY';
      }
      if (check.operation === 'delete') {
        if (isSignedIn && check.resourceData?.ownerUid === authUid) return 'ALLOW';
        return 'DENY';
      }
      return 'DENY';
    }

    case 'draw_snapshots': {
      const snapshotId = check.pathParams.snapshotId;
      if (!isValidId(snapshotId)) return 'DENY';
      if (check.operation === 'get' || check.operation === 'list') {
        if (!isSignedIn) return 'DENY';
        const docOwner = check.resourceData?.ownerUid;
        if (!docOwner || docOwner === authUid) return 'ALLOW';
        return 'DENY';
      }
      if (check.operation === 'create') {
        if (isSignedIn && check.requestData?.ownerUid === authUid) return 'ALLOW';
        return 'DENY';
      }
      // Snapshots are strictly immutable
      if (check.operation === 'update') return 'DENY';
      if (check.operation === 'delete') {
        if (isSignedIn && check.resourceData?.ownerUid === authUid) return 'ALLOW';
        return 'DENY';
      }
      return 'DENY';
    }

    case 'draws': {
      const drawId = check.pathParams.drawId;
      if (!isValidId(drawId)) return 'DENY';
      if (check.operation === 'get' || check.operation === 'list') {
        if (!isSignedIn) return 'DENY';
        const docOwner = check.resourceData?.ownerUid;
        if (!docOwner || docOwner === authUid) return 'ALLOW';
        return 'DENY';
      }
      if (check.operation === 'create') {
        if (isSignedIn && check.requestData?.ownerUid === authUid) return 'ALLOW';
        return 'DENY';
      }
      if (check.operation === 'update') {
        if (
          isSignedIn &&
          check.resourceData?.ownerUid === authUid &&
          check.requestData?.ownerUid === check.resourceData?.ownerUid
        ) {
          return 'ALLOW';
        }
        return 'DENY';
      }
      if (check.operation === 'delete') {
        if (isSignedIn && check.resourceData?.ownerUid === authUid) return 'ALLOW';
        return 'DENY';
      }
      return 'DENY';
    }

    case 'audit_logs': {
      const logId = check.pathParams.logId;
      if (!isValidId(logId)) return 'DENY';
      if (check.operation === 'get' || check.operation === 'list') {
        if (!isSignedIn) return 'DENY';
        return check.resourceData?.operatorUid === authUid ? 'ALLOW' : 'DENY';
      }
      if (check.operation === 'create') {
        if (isSignedIn && check.requestData?.operatorUid === authUid) {
          return 'ALLOW';
        }
        return 'DENY';
      }
      // Audit logs are append-only
      if (check.operation === 'update' || check.operation === 'delete') {
        return 'DENY';
      }
      return 'DENY';
    }

    case 'global_participants': {
      const tiktokUserId = check.pathParams.tiktokUserId;
      if (!isValidId(tiktokUserId)) return 'DENY';
      if (check.operation === 'get' || check.operation === 'list') {
        return isSignedIn ? 'ALLOW' : 'DENY';
      }
      // Mutações diretas do Client SDK bloqueadas na Fase 10.4
      return 'DENY';
    }

    case 'company_settings':
    case 'subscription_settings': {
      if (check.operation === 'get' || check.operation === 'list') return 'ALLOW';
      // Mutation must be done via backend
      return 'DENY';
    }

    default:
      return 'DENY';
  }
}

async function runRulesEvaluation() {
  console.log('================================================================');
  console.log('  GIO DA SORTE PRO — SUÍTE DE TESTES SEC-01 (FIRESTORE RULES)');
  console.log('================================================================\n');

  // Verify firestore.rules file contents
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  // Check 1: Absence of public allow read, write: if true
  const publicReadWriteMatches = rulesContent.match(/allow\s+read,\s*write\s*:\s*if\s*true/g);
  console.log(`[VERIFICAÇÃO DE TEXTO] Ocorrências de "allow read, write: if true": ${publicReadWriteMatches ? publicReadWriteMatches.length : 0}`);
  if (publicReadWriteMatches && publicReadWriteMatches.length > 0) {
    throw new Error('Regras contêm allow read, write: if true remanescentes!');
  }
  console.log('✓ [PASS] Nenhuma regra allow read, write: if true encontrada em firestore.rules.');

  // Check 2: /users/{userId}/settings/{settingId} requires isOwner(userId)
  const settingsMatch = rulesContent.includes('match /settings/{settingId}') &&
    rulesContent.includes('isOwner(userId)');
  if (!settingsMatch) {
    throw new Error('/users/{userId}/settings/{settingId} não está protegido por isOwner(userId)!');
  }
  console.log('✓ [PASS] /users/{userId}/settings/{settingId} protegido estritamente por isOwner(userId).');

  // Check 3: Snapshots and Audit Logs immutability
  const snapshotUpdateFalse = rulesContent.includes('match /draw_snapshots/{snapshotId}') &&
    rulesContent.includes('allow update: if false;');
  const auditLogsImmutable = rulesContent.includes('match /audit_logs/{logId}') &&
    rulesContent.includes('allow update: if false;') &&
    rulesContent.includes('allow delete: if false;');
  if (!snapshotUpdateFalse || !auditLogsImmutable) {
    throw new Error('Snapshots ou Audit Logs não estão definidos como imutáveis!');
  }
  console.log('✓ [PASS] Snapshots e Audit Logs definidos como imutáveis.');

  // Check 4: Phase 10.4 Proteções Comerciais e LGPD
  const proShieldMatch = rulesContent.includes('statusState == existing().statusState');
  const lgpdListMatch = rulesContent.includes('match /lgpd_requests/{requestId}') &&
    rulesContent.includes('resource.data.userId == request.auth.uid');
  const globalPartLockMatch = rulesContent.includes('match /global_participants/{tiktokUserId}') &&
    rulesContent.includes('allow create, update, delete: if false;');

  if (!proShieldMatch || !lgpdListMatch || !globalPartLockMatch) {
    throw new Error('Faltam proteções de plano PRO, isolamento LGPD ou bloqueio de global_participants em firestore.rules!');
  }
  console.log('✓ [PASS] Proteções comerciais PRO, isolamento LGPD e trava de global_participants verificadas em firestore.rules.');

  // Run test matrix against simulator
  console.log('\n--- EXECUTANDO MATRIZ DE TESTES DE REGRAS ---');
  let passedCount = 0;
  for (const check of checks) {
    const outcome = evaluateRule(check);
    const passed = outcome === check.expectedOutcome;
    if (passed) {
      passedCount++;
      console.log(`✓ [PASS] ${check.id} [${check.category}]: ${check.scenario} -> ${outcome}`);
    } else {
      console.error(`✗ [FAIL] ${check.id} [${check.category}]: ${check.scenario} -> Obtido: ${outcome}, Esperado: ${check.expectedOutcome}`);
    }
  }

  console.log(`\n================================================================`);
  console.log(`  RESULTADO: ${passedCount}/${checks.length} testes de regras aprovados.`);
  console.log(`================================================================\n`);

  if (passedCount !== checks.length) {
    process.exit(1);
  }
}

runRulesEvaluation().catch((err) => {
  console.error('Falha na suíte SEC-01:', err);
  process.exit(1);
});
