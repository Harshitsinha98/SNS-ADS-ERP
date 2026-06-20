// src/utils/leadLifecycle.js
export function getLeadCategory(lead) {
  if (["Won", "Lost", "Closed"].includes(lead.status)) return "Closed";

  // Rule 1: New to Call — abhi tak contact nahi hua, follow-up date bhi nahi set
  if (!lead.lastContactedAt && !lead.followUpDate) return "New to Call";

  if (lead.followUpDate) {
    const now = new Date();
    const followUp = new Date(lead.followUpDate);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    if (followUp >= todayStart && followUp < todayEnd) return "Follow-up Today";  // Rule 2
    if (followUp < todayStart) return "Overdue";                                  // Rule 3
    return "Upcoming";                                                            // future date
  }

  return "New to Call";
}