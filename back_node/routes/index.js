var express = require('express');
var router = express.Router();

const epd = require('../modules/epd_engine');
const epd_tool = require('../modules/app_tools');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', {
    title: 'Express'
  });
});

/**
 * 得到已经装载的模板列表
 */
router.get('/list', (req, res) => {
  let tplNameArr = epd.M_getAllTemplateNames();
  res.json(tplNameArr);
});

/**
 * 根据模板名称得到模板数据
 */
router.get('/template/:tplName', (req, res) => {
  let tplObj = epd.M_getTemplateDataByName(req.params.tplName);
  res.json(tplObj);
});

/**
 * 调用模板方法
 * tplName：模板名称
 * body内容为inputParameters
 */
router.post('/epd/:tplName', (req, res) => {
  let result = epd.M_calResultByRule({
    "tplName": req.params.tplName, // 模板名称
    "inputParameters": req.body
  });

  res.json(result);
});

/**
 * 将模板进行简化
 */
router.post('/simplify', (req, res)=>{
  let simplifedObj = epd_tool.simplifyRuleTemplate(req.body);
  res.json(simplifedObj);
});

module.exports = router;