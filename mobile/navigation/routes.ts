import type { ComponentType } from 'react';

import ChildBoxesIndex from '../app/child-boxes/index';
import ChildBoxDetail from '../app/child-boxes/[id]';
import ChildBoxesGenerate from '../app/child-boxes/generate';
import CustomersIndex from '../app/customers/index';
import CustomerDetail from '../app/customers/[id]';
import CustomerNew from '../app/customers/new';
import DispatchIndex from '../app/dispatch/index';
import DispatchDetail from '../app/dispatch/[id]';
import DispatchCreate from '../app/dispatch/create';
import EcommerceIndex from '../app/ecommerce/index';
import EcommerceDetail from '../app/ecommerce/[id]';
import MasterCartonsIndex from '../app/master-cartons/index';
import MasterCartonDetail from '../app/master-cartons/[id]';
import MasterCartonCreate from '../app/master-cartons/create';
import ProductsIndex from '../app/products/index';
import ProductDetail from '../app/products/[id]';
import Repack from '../app/repack';
import Reports from '../app/reports';
import ReturnsIndex from '../app/returns/index';
import ReturnDetail from '../app/returns/[id]';
import ReturnCreate from '../app/returns/create';
import SamplesIndex from '../app/samples/index';
import SampleDetail from '../app/samples/[id]';
import Settings from '../app/settings';
import Storage from '../app/storage';
import Unpack from '../app/unpack';
import Users from '../app/users';

// ─── Route table ──────────────────────────────────────────────────────────────
// The single source of truth for every stack screen. `path` is the URL-style path
// used by `router.push('/samples/123')`; `:name` segments become route params
// (read with useLocalSearchParams). The four bottom tabs and Login live in
// AppNavigator, not here.

export interface AppRoute {
  /** URL-style pattern, e.g. '/samples/:id'. Also used as the navigator route name. */
  path: string;
  component: ComponentType<any>;
  /** Initial header title (a screen can override it with <Stack.Screen options={{ title }}/>). */
  title: string;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/child-boxes', component: ChildBoxesIndex, title: 'Child Boxes' },
  { path: '/child-boxes/generate', component: ChildBoxesGenerate, title: 'Generate Child Boxes' },
  { path: '/child-boxes/:id', component: ChildBoxDetail, title: 'Child Box' },
  { path: '/customers', component: CustomersIndex, title: 'Customers' },
  { path: '/customers/new', component: CustomerNew, title: 'New Customer' },
  { path: '/customers/:id', component: CustomerDetail, title: 'Customer' },
  { path: '/dispatch', component: DispatchIndex, title: 'Dispatches' },
  { path: '/dispatch/create', component: DispatchCreate, title: 'New Dispatch' },
  { path: '/dispatch/:id', component: DispatchDetail, title: 'Dispatch' },
  { path: '/ecommerce', component: EcommerceIndex, title: 'E-commerce' },
  { path: '/ecommerce/:id', component: EcommerceDetail, title: 'E-commerce Record' },
  { path: '/master-cartons', component: MasterCartonsIndex, title: 'Master Cartons' },
  { path: '/master-cartons/create', component: MasterCartonCreate, title: 'New Master Carton' },
  { path: '/master-cartons/:id', component: MasterCartonDetail, title: 'Master Carton' },
  { path: '/products', component: ProductsIndex, title: 'Products' },
  { path: '/products/:id', component: ProductDetail, title: 'Product' },
  { path: '/repack', component: Repack, title: 'Repack' },
  { path: '/reports', component: Reports, title: 'Reports' },
  { path: '/returns', component: ReturnsIndex, title: 'Returns' },
  { path: '/returns/create', component: ReturnCreate, title: 'New Return' },
  { path: '/returns/:id', component: ReturnDetail, title: 'Return' },
  { path: '/samples', component: SamplesIndex, title: 'Samples' },
  { path: '/samples/:id', component: SampleDetail, title: 'Sample' },
  { path: '/settings', component: Settings, title: 'Settings' },
  { path: '/storage', component: Storage, title: 'Storage' },
  { path: '/unpack', component: Unpack, title: 'Unpack' },
  { path: '/users', component: Users, title: 'Users' },
];
