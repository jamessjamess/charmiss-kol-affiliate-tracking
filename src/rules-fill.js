/* rules-fill.js — CR-11 R5 §4.11: fill once, carried on. A Phase's default pillar and a Campaign's default payment term set once and
   carried into New deal / Bulk shortlist (with a chip that says where it came from) · the only product of a Campaign picked for you ·
   Apply to the deals that are still empty (one event a deal · Undo) · the Allocation note when most spend has no pillar.
   Order of the payment term (§9 #12): the KOL's default → the Campaign's → none · CR-18 §4.1: the KOL's default → none (a Campaign no longer fills a
   new deal — its term stays for Apply in the Campaign drawer). Pure functions. Adds to KT.rules (load after rules-ship.js). */
Object.assign(KT.rules, (function (R) {
  'use strict';
  const { isBlank, isISODate } = R;
  const phaseOf = (state, id) => state.phases.find(p => p.phase_id === id) || null;
  const campaignOf = (state, id) => state.campaigns.find(c => c.campaign_id === id) || null;
  const campaignDefaultTerm = (state, campaignId) => { const c = campaignOf(state, campaignId); return c && R.isTerm(c.default_payment_term) ? c.default_payment_term : null; };
  const phaseDefaultPillar = (state, phaseId) => { const p = phaseOf(state, phaseId); return p && !isBlank(p.default_pillar) ? p.default_pillar : null; };
  /* the term a new deal starts with → { term, source: 'kol' | null } (CR-18: only the KOL's default) */
  function termPrefill(state, kol) {
    if (kol && R.isTerm(kol.default_payment_term)) return { term: kol.default_payment_term, source: 'kol' };
    return { term: '', source: null };
  }
  /* Auto by post date: the one Phase of the Campaign whose dates hold the date (none, or overlapping → null) */
  function phaseOfDate(state, campaignId, date) {
    if (!isISODate(date)) return null;
    const list = state.phases.filter(p => p.campaign_id === campaignId && R.isApproved(p) && isISODate(p.start_date) && isISODate(p.end_date) && p.start_date <= date && date <= p.end_date);
    return list.length === 1 ? list[0].phase_id : null;
  }
  /* the pillar a new deal starts with: the Phase picked, else the Phase of its expected post date — when that Phase has a default → { pillar, phase_id } | null */
  function pillarPrefill(state, campaignId, phaseId, date) {
    const pid = phaseId || phaseOfDate(state, campaignId, date), p = pid ? phaseOf(state, pid) : null;
    return p && p.campaign_id === campaignId && !isBlank(p.default_pillar) ? { pillar: p.default_pillar, phase_id: p.phase_id } : null;
  }
  /* the Campaign's only (active) product → its TR code | null */
  function onlyProduct(state, campaignId) {
    const list = campaignId ? R.campaignProducts(state, campaignId).filter(p => p.active !== false) : [];
    return list.length === 1 ? list[0].tr_code : null;
  }
  /* Phase drawer › Apply to n deals without pillar: the deals whose primary Phase is this one, not cancelled, no pillar — imported ones too */
  function dealsWithoutPillar(state, phaseId, idx) {
    const index = idx || R.phaseIndex(state);
    return state.deals.filter(d => d.status !== 'Cancel' && isBlank(d.pillar) && R.primaryPhase(index, d.deal_id) === phaseId);
  }
  /* Campaign drawer › Apply to n open deals without term (a deal with a term is never touched) */
  const openDealsWithoutTerm = (state, campaignId) => state.deals.filter(d => d.campaign_id === campaignId && R.isOpenDeal(d) && !R.termOf(d));
  /* a default pillar must be one of the list (or none) · a default term one of the terms (or none) */
  const isPillarValue = (lookups, v) => isBlank(v) || (lookups.pillar_list || []).includes(v);
  /* Allocation note: the spend with no pillar is more than half of the scope's spend */
  function mostSpendNoPillar(actual) {
    const total = Number((actual || {}).total) || 0, none = Number(((actual || {}).money || {})[R.NOT_SET]) || 0;
    return total > 0 && none / total > 0.5;
  }

  return { campaignDefaultTerm, phaseDefaultPillar, termPrefill, phaseOfDate, pillarPrefill, onlyProduct, dealsWithoutPillar, openDealsWithoutTerm, isPillarValue, mostSpendNoPillar };
})(KT.rules));
