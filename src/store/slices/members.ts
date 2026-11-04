import { createLab, createMember } from "@/domain/factory";
import type { ID, Lab, Member } from "@/domain/schema";
import type { Get, Update } from "./types";

export interface MembersSlice {
  addMembers: (members: (Partial<Member> & { name: string })[]) => ID[];
  updateMember: (id: ID, patch: Partial<Omit<Member, "id">>) => void;
  updateMembers: (ids: ID[], patch: Partial<Omit<Member, "id">>) => void;
  /** 席割当・昨年度・ロックからも除去する */
  removeMembers: (ids: ID[]) => void;
  reorderMembers: (orderedIds: ID[]) => void;
  addLab: (init: Partial<Lab> & { name: string; color: string }) => ID;
  updateLab: (id: ID, patch: Partial<Omit<Lab, "id">>) => void;
  /** 所属者は moveTo へ（undefined なら未所属） */
  removeLab: (id: ID, moveTo?: ID) => void;
  reorderLabs: (orderedIds: ID[]) => void;
}

export function createMembersSlice(update: Update, _get: Get): MembersSlice {
  return {
    addMembers: (inits) => {
      const created = inits.map(createMember);
      update((d) => void d.members.push(...created));
      return created.map((m) => m.id);
    },
    updateMember: (id, patch) =>
      update((d) => {
        const m = d.members.find((x) => x.id === id);
        if (m) Object.assign(m, patch);
      }),
    updateMembers: (ids, patch) =>
      update((d) => {
        const set = new Set(ids);
        for (const m of d.members) if (set.has(m.id)) Object.assign(m, patch);
      }),
    removeMembers: (ids) =>
      update((d) => {
        const set = new Set(ids);
        d.members = d.members.filter((m) => !set.has(m.id));
        for (const p of d.plans) {
          for (const [sid, mid] of Object.entries(p.assignment))
            if (set.has(mid)) delete p.assignment[sid];
          for (const mid of Object.keys(p.roomOnly)) if (set.has(mid)) delete p.roomOnly[mid];
        }
      }),
    reorderMembers: (orderedIds) =>
      update((d) => {
        const byId = new Map(d.members.map((m) => [m.id, m]));
        const next = orderedIds.map((id) => byId.get(id)).filter((m) => m !== undefined);
        d.members = [...next, ...d.members.filter((m) => !orderedIds.includes(m.id))];
      }),
    addLab: (init) => {
      const lab = createLab(init);
      update((d) => void d.labs.push(lab));
      return lab.id;
    },
    updateLab: (id, patch) =>
      update((d) => {
        const l = d.labs.find((x) => x.id === id);
        if (l) Object.assign(l, patch);
      }),
    removeLab: (id, moveTo) =>
      update((d) => {
        d.labs = d.labs.filter((l) => l.id !== id);
        for (const m of d.members) if (m.labId === id) m.labId = moveTo;
      }),
    reorderLabs: (orderedIds) =>
      update((d) => {
        const byId = new Map(d.labs.map((l) => [l.id, l]));
        const next = orderedIds.map((id) => byId.get(id)).filter((l) => l !== undefined);
        d.labs = [...next, ...d.labs.filter((l) => !orderedIds.includes(l.id))];
      }),
  };
}
