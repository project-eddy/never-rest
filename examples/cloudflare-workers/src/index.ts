import { createUsersServer } from '@never-rest-examples/shared-contract';

const handler = createUsersServer({ origin: 'workers-demo' });

export default {
  fetch(request: Request): Promise<Response> {
    return handler(request, undefined);
  },
} satisfies ExportedHandler;
