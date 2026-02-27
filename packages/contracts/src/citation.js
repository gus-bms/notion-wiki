"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.citationSchema = void 0;
const zod_1 = require("zod");
exports.citationSchema = zod_1.z.object({
    chunkId: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).transform((value) => String(value)),
    title: zod_1.z.string().min(1),
    url: zod_1.z.string().url(),
    quote: zod_1.z.string().min(1).max(400)
});
//# sourceMappingURL=citation.js.map