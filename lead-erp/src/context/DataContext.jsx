/**
 * DataContext — backward-compatible facade over focused contexts.
 *
 * ARCHITECTURAL DECISION: The original DataContext managed all application state
 * in a single provider (~340 lines). It has been decomposed into:
 * - LeadsContext: leads, follow-ups, financials, WhatsApp templates
 * - TeamContext: members, invites, user CRUD
 * - NotificationsContext: notifications, activity log
 * - SettingsContext: org settings, goals
 *
 * This file now serves as a FACADE that:
 * 1. Composes all child providers (for provider tree simplicity).
 * 2. Re-exports the original `useData()` hook with the SAME interface so
 *    that NO existing UI components need any changes.
 * 3. Allows gradual migration: new components import from focused contexts
 *    (useLeads, useTeam, etc.) while old ones continue using useData().
 *
 * ZERO UI REGRESSION: The value object returned by useData() contains every
 * property that was previously available. Components consuming useData() see
 * no difference.
 */

import { createContext, useContext } from "react";
import { LeadsProvider, useLeads } from "./LeadsContext";
import { TeamProvider, useTeam } from "./TeamContext";
import { NotificationsProvider, useNotifications } from "./NotificationsContext";
import { SettingsProvider, useSettings } from "./SettingsContext";

// ── Facade Hook ─────────────────────────────────────────────────────

const DataContext = createContext();

/**
 * useData() — original interface, unchanged.
 * New components should prefer useLeads(), useTeam(), etc. for better
 * render performance.
 */
export const useData = () => useContext(DataContext);

/**
 * Inner component that merges all focused contexts into one value object.
 * This ensures useData() returns the same shape as before.
 */
function DataFacade({ children }) {
  const leads = useLeads();
  const team = useTeam();
  const notifications = useNotifications();
  const settingsCtx = useSettings();

  // Merge into the original shape
  const value = {
    // From LeadsContext
    leads: leads.leads,
    followUpTasks: leads.followUpTasks,
    whatsappTemplates: leads.whatsappTemplates,
    financials: leads.financials,
    updateLead: leads.updateLead,
    addNote: leads.addNote,
    addWorknote: leads.addWorknote,
    updateLeadStatus: leads.updateLeadStatus,
    updatePriority: leads.updatePriority,
    updateFollowUpDate: leads.updateFollowUpDate,
    updateLeadRevenue: leads.updateLeadRevenue,
    reassignLead: leads.reassignLead,
    reassignAllLeads: leads.reassignAllLeads,
    blacklistLead: leads.blacklistLead,
    addBulkLeads: leads.addBulkLeads,
    addManualLead: leads.addManualLead,
    createWebsiteLeadIntakeKey: leads.createWebsiteLeadIntakeKey,
    scheduleFollowUp: leads.scheduleFollowUp,
    completeFollowUp: leads.completeFollowUp,
    triggerWhatsAppSync: leads.triggerWhatsAppSync,

    // From TeamContext
    users: team.users,
    addUser: team.addUser,
    updateUser: team.updateUser,
    deactivateUser: team.deactivateUser,
    activateUser: team.activateUser,
    changePlan: team.changePlan,
    scheduleDowngrade: team.scheduleDowngrade,
    cancelDowngrade: team.cancelDowngrade,

    // From NotificationsContext
    notifications: notifications.notifications,
    activity: notifications.activity,
    pushNotif: notifications.pushNotif,
    markRead: notifications.markRead,
    logActivity: notifications.logActivity,

    // From SettingsContext
    settings: settingsCtx.settings,
    goals: settingsCtx.goals,
    setSettings: settingsCtx.setSettings,
    setMyGoal: settingsCtx.setMyGoal,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

// ── Composed Provider ───────────────────────────────────────────────

/**
 * DataProvider — drop-in replacement for the original.
 * Wraps children in all focused providers + the facade.
 */
export function DataProvider({ children }) {
  return (
    <SettingsProvider>
      <TeamProvider>
        <NotificationsProvider>
          <LeadsProvider>
            <DataFacade>
              {children}
            </DataFacade>
          </LeadsProvider>
        </NotificationsProvider>
      </TeamProvider>
    </SettingsProvider>
  );
}
