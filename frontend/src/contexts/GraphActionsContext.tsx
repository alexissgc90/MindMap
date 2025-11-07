import { createContext, useContext } from 'react';

export type GraphActions = {
  quickConnect: (sourceId: string, targetId: string) => void;
  foldBranch: (nodeId: string) => void;
  unfoldBranch: (nodeId: string) => void;
};

const GraphActionsContext = createContext<GraphActions>({
  quickConnect: () => undefined,
  foldBranch: () => undefined,
  unfoldBranch: () => undefined,
});

export const GraphActionsProvider = GraphActionsContext.Provider;

export const useGraphActions = () => useContext(GraphActionsContext);
