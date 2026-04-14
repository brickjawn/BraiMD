const router = require('express').Router();
const skillController = require('../controllers/skillController');

router.get('/', skillController.list);
router.get('/search', skillController.search);
router.get('/:id', skillController.getById);
router.post('/', skillController.create);
router.put('/:id', skillController.update);
router.delete('/:id', skillController.remove);

module.exports = router;
