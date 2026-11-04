import { create } from "zustand";

/** プロジェクト管理ダイアログの開閉（他画面からも openProjectDialog() で開ける） */
export const useProjectDialog = create<{ open: boolean }>()(() => ({ open: false }));

export const openProjectDialog = () => useProjectDialog.setState({ open: true });
export const closeProjectDialog = () => useProjectDialog.setState({ open: false });
