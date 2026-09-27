import male from '../../assets/seating/student-male.png';
import female from '../../assets/seating/student-female.png';
import unspecified from '../../assets/seating/student-unspecified.png';
/** @type {Record<string,string>} */
const assets={male,female,unspecified};
/** @param {string} appearance */
export const artFor=appearance=>assets[appearance]||unspecified;
