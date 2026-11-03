import {
  mercadoPagoSubscriptionService,
  createLiveMercadoPagoTransport,
  redactSensitiveMpData,
} from '../src/server/mercadoPagoSubscriptionService.js';

export async function runAssistedPostAuthorizationVerification(preapprovalId: string, homologUid: string): Promise<void> {
  const token = (process.env.MP_ACCESS_TOKEN || '').trim();
  await mercadoPagoSubscriptionService.verifyCollectorAccountIdentity();
  const liveTransport = createLiveMercadoPagoTransport(token);

  console.log(`[Assisted Homologation] Running verification for preapprovalId=${preapprovalId}, uid=${homologUid}`);

  // Step 7: Query GET /preapproval/{id}
  const getRes = await liveTransport.getPreapproval(preapprovalId);
  console.log(`[Step 7 - GET /preapproval] HTTP ${getRes.status}`);
  console.log(JSON.stringify(redactSensitiveMpData(getRes.data), null, 2));

  // Step 8: Test Webhook dispatch and local sync
  const syncResult = await mercadoPagoSubscriptionService.verifyAndSyncUserSubscription({
    authenticatedUid: homologUid,
    requestedPreapprovalId: preapprovalId,
  });
  if (syncResult.subscription) {
    const s = syncResult.subscription;
    console.log(`[Step 7/8 - Local Sync Result]`, {
      tier: s.tier,
      statusState: s.statusState,
      billingSubStatus: s.billingSubStatus,
      trialApplied: s.trialApplied,
      trialDaysGranted: s.trialDaysGranted,
      trialEndDate: s.trialEndDate,
      nextPaymentDate: s.nextPaymentDate,
    });
  }

  // If status is authorized, proceed to cancellation and retention verification
  if (getRes.data?.status === 'authorized') {
    console.log(`[Step 8] Webhook/Sync confirmed subscription status = authorized.`);

    // Step 9: Cancellation test during free trial
    console.log(`[Step 9] Executing cancellation via PUT /preapproval/${preapprovalId} with {"status":"cancelled"}...`);
    const cancelRes = await mercadoPagoSubscriptionService.cancelSubscription({
      uid: homologUid,
      actor: 'homologation_assisted',
    });
    console.log(`[Step 9 - Cancel Result]`, JSON.stringify(cancelRes, null, 2));

    // Re-query API to confirm cancellation
    const postCancelRes = await liveTransport.getPreapproval(preapprovalId);
    console.log(`[Step 9 - Post-Cancel Remote Status]`, postCancelRes.data?.status);

    // Step 10: Verify retention of PRO access until trialEndDate
    const postCancelSync = await mercadoPagoSubscriptionService.verifyAndSyncUserSubscription({
      authenticatedUid: homologUid,
      requestedPreapprovalId: preapprovalId,
    });
    if (postCancelSync.subscription) {
      const ps = postCancelSync.subscription;
      console.log(`[Step 10 - Post-Cancel Subscription State]`, {
        tier: ps.tier,
        statusState: ps.statusState,
        billingSubStatus: ps.billingSubStatus,
        cancelAtPeriodEnd: ps.cancelAtPeriodEnd,
        trialEndDate: ps.trialEndDate,
        retainedAccess: ps.tier === 'PRO' && ps.statusState === 'ACTIVE',
      });
    }
  } else {
    console.log(`[Status Notice] Preapproval is currently "${getRes.data?.status}". Authorization by user in checkout pending.`);
  }
}

if (process.argv[1]?.endsWith('verify-assisted-checkout.ts')) {
  const preapprovalId = process.argv[2] || '501b05a39dbd4ed4ac4e8188714317e2';
  const homologUid = process.argv[3] || 'uid_homolog_assisted_1793557917318';
  runAssistedPostAuthorizationVerification(preapprovalId, homologUid).catch((err) => {
    console.error('Error during assisted verification:', err);
    process.exit(1);
  });
}
