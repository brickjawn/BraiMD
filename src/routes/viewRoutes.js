const router = require('express').Router();
const viewController = require('../controllers/viewController');

router.get('/', viewController.index);
router.get('/create', viewController.createForm);
router.post('/create', viewController.createSkill);
router.get('/skills/:id', viewController.viewSkill);
router.get('/skills/:id/edit', viewController.editForm);
router.post('/skills/:id/edit', viewController.updateSkill);
router.post('/skills/:id/delete', viewController.deleteSkill);
router.get('/tree', viewController.tree);
router.get('/logs', viewController.logs);
router.get('/help', viewController.help);

module.exports = router;
