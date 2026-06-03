const { execSync } = require("child_process");

console.log("Generating OpenAPI types...");
const services = ["auth", "user", "chat"];

const outputs = services.map((service) => {
  console.log(`Generating types for ${service}...`);
  const output = `libs/shared-types/src/v1/${service}.types.ts`;
  execSync(
    `npx openapi-typescript libs/openapi-specs/src/v1/${service}.yaml -o ${output}`,
  );
  return output;
});

// openapi-typescript output is not prettier-formatted; run the project
// formatter so generated types stay clean and don't trip format:check.
console.log("Formatting generated types...");
execSync(`npx nx format:write --files=${outputs.join(",")}`, {
  stdio: "inherit",
});

console.log("Done.");
