import {
  createContext,
  useContext,
  type ReactNode
} from 'react';
import type { DiscussionApi } from './types';
import { httpApi } from './httpApi';

const DiscussionApiContext = createContext<DiscussionApi>(httpApi);

export function DiscussionApiProvider({
  api,
  children
}: {
  api: DiscussionApi;
  children: ReactNode;
}) {
  return (
    <DiscussionApiContext.Provider value={api}>
      {children}
    </DiscussionApiContext.Provider>
  );
}

export function useDiscussionApi(): DiscussionApi {
  return useContext(DiscussionApiContext);
}
