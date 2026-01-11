const fs = require('fs');
const content = fs.readFileSync('src/controllers/order.controller.js', 'utf8');
// Change auto-assignment logic to not assign, just find
const updatedContent = content.replace(
  /if \(assignmentResult\.success && assignmentResult\.assigned\) \{[^}]+\}/s,
  `if (assignmentResult.success && assignmentResult.assigned) {
          // Don't auto-assign, just update status to searching
          // Footman will need to accept manually
          await order.update({
            order_status: 'searching' // Footman needs to accept
            // Note: assigned_footman_id is NOT set here
          });
        }`
);
fs.writeFileSync('src/controllers/order.controller.js', updatedContent);
console.log('✅ Updated order controller: removed auto-assignment');
