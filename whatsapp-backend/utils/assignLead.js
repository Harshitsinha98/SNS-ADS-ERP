// whatsapp-backend/utils/assignLead.js

export async function getNextEmployeeRoundRobin(db) {
  try {
    // 1. Saare active employees ki list database se le kar aao consistent order mein
    const employeesSnap = await db.collection('users')
      .where('role', '==', 'employee')
      .where('active', '==', true)
      .get();

    const employees = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    if (employees.length === 0) return null;

    // 2. Meta collection ke andar se counter check karo transaction ke sath
    const counterRef = db.collection('meta').doc('leadAssignment');
    
    return await db.runTransaction(async (tx) => {
      const counterDoc = await tx.get(counterRef);
      
      const lastIndex = counterDoc.exists ? counterDoc.data().lastIndex : -1;
      
      // Next index nikaalo (index limits ke andar hi ghumega)
      const nextIndex = (lastIndex + 1) % employees.length;
      
      // Database mein naya index save kar do taaki agla lead agle ko mile
      tx.set(counterRef, { lastIndex: nextIndex }, { merge: true });
      
      return employees[nextIndex];
    });
  } catch (error) {
    console.error("❌ Lead assignment mein error aaya:", error);
    return null;
  }
}