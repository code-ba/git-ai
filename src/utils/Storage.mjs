import Configstore from 'configstore';
import { NAME } from '../const.mjs';
export const config = new Configstore(NAME, {
  style: 'long',
  description: 'bullet',
  prefix: true,
});
