// whatsapp-backend/utils/assignLead.js
// Multi-tenant version - org-scoped lead assignment

/**
 * Get the next employee for lead assignment using round-robin
 * @param {FirebaseFirestore} db - Firestore instance
 * @param {string} orgId - Organization ID
 * @returns {Object|null} Employee object or null if no employees available
 */
export async function getNextEmployeeRoundRobin(db, orgId) {
  try {
    // 1. Get all active employees for this org from memberships collection
    const membershipsSnap = await db.collection('memberships')
      .where('orgId', '==', orgId)
      .where('role', '==', 'employee')
      .where('active', '==', true)
      .get();

    const employees = membershipsSnap.docs.map(d => ({ 
      id: d.data().uid, 
      name: d.data().displayName,
      ...d.data() 
    }));
    
    if (employees.length === 0) return null;

    // 2. Get/Update counter in org-scoped meta collection
    const counterRef = db.collection('organizations')
      .doc(orgId)
      .collection('meta')
      .doc('leadAssignment');
    
    return await db.runTransaction(async (tx) => {
      const counterDoc = await tx.get(counterRef);
      
      const lastIndex = counterDoc.exists ? counterDoc.data().lastIndex : -1;
      
      // Calculate next index (wraps around)
      const nextIndex = (lastIndex + 1) % employees.length;
      
      // Save new index to database
      tx.set(counterRef, { 
        lastIndex: nextIndex,
        lastAssignedAt: new Date().toISOString(),
      }, { merge: true });
      
      return employees[nextIndex];
    });
  } catch (error) {
    console.error("❌ Lead assignment error:", error);
    return null;
  }
}

/**
 * Get employee with least workload for workload-based assignment
 * @param {FirebaseFirestore} db - Firestore instance
 * @param {string} orgId - Organization ID
 * @returns {Object|null} Employee object or null if no employees available
 */
export async function getNextEmployeeByWorkload(db, orgId) {
  try {
    // Get all active employees for this org
    const membershipsSnap = await db.collection('memberships')
      .where('orgId', '==', orgId)
      .where('role', '==', 'employee')
      .where('active', '==', true)
      .get();

    const employees = membershipsSnap.docs.map(d => ({ 
      id: d.data().uid, 
      name: d.data().displayName,
    }));

    if (employees.length === 0) return null;

    // Count leads for each employee
    const counts = {};
    for (const e of employees) {
      const leadsSnap = await db.collection('organizations')
        .doc(orgId)
        .collection('leads')
        .where('assignedTo', '==', e.id)
        .get();
      counts[e.id] = leadsSnap.size;
    }

    // Sort by count and return employee with lowest workload
    const sorted = employees.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
    return sorted[0];
  } catch (error) {
    console.error("❌ Workload assignment error:", error);
    return null;
  }
}
