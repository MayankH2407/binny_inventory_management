module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Inlines process.env.API_URL at bundle time, e.g.
  //   API_URL=https://binnyfootwear.basiq360.com/api/v1 npm run build:apk
  // (run `cd android && ./gradlew clean` first when switching targets — Gradle won't notice an env change).
  plugins: [['transform-inline-environment-variables', { include: ['API_URL'] }]],
};
