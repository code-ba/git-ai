import Configstore from 'configstore';

export const config = new Configstore('@git-ai/cli', {
  style: 'long',
  description: 'bullet',
  prefix: true,
});
