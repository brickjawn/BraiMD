const router = require('express').Router();
const edgeController = require('../controllers/edgeController');

router.post('/', edgeController.create);
router.delete('/:id', edgeController.remove);

module.exports = router;
