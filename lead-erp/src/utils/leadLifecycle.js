// src/utils/leadLifecycle.js

export function getLeadFlags(lead) {
  // 1. Agar lead close ho chuki hai, toh usko list se bahar karo
  if (["Won", "Lost", "Closed", "Closed-Won"].includes(lead.status)) {
    return { isClosed: true, isNew: false, isFollowUpToday: false, isOverdue: false };
  }

  // 2. Aaj ke din ka start aur end time set karo
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // 3. Follow-up date nikaalo. Agar manually set nahi hai, toh lead create hone wali date uthao
  // (Isse aaj ki nayi leads automatically 'Follow-up Today' me bhi aa jayengi)
  const followUp = new Date(lead.followUpDate || lead.createdAt);

  // 4. Return flags (Ek lead ab multiple conditions pass kar sakti hai)
  return {
    isClosed: false,
    
    // Nayi lead tab tak "New to Call" me rahegi jab tak admin/employee usme pehla worknote/call add nahi karta
    isNew: !lead.lastContactedAt, 
    
    // Agar followUp date aaj ki hai
    isFollowUpToday: followUp >= todayStart && followUp < todayEnd, 
    
    // Agar followUp date guzar chuki hai (past date)
    isOverdue: followUp < todayStart, 
  };
}