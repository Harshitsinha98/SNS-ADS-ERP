// src/utils/leadLifecycle.js

export function getLeadFlags(lead) {
  // 1. If the lead is already closed, keep it out of the list
  if (["Won", "Lost", "Closed", "Closed-Won"].includes(lead.status)) {
    return { isClosed: true, isNew: false, isFollowUpToday: false, isOverdue: false };
  }

  // 2. Set the start and end time for today
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // 3. Determine the follow-up date. If not set manually, use the lead's created date
  // (so today's new leads automatically also show up under 'Follow-up Today')
  const followUp = new Date(lead.followUpDate || lead.createdAt);

  // 4. Return flags (a lead can now satisfy multiple conditions)
  return {
    isClosed: false,

    // A new lead stays under "New to Call" until an admin/employee adds the first worknote/call
    isNew: !lead.lastContactedAt, 
    
    // Whether the followUp date is today
    isFollowUpToday: followUp >= todayStart && followUp < todayEnd, 
    
    // Whether the followUp date is in the past
    isOverdue: followUp < todayStart, 
  };
}
